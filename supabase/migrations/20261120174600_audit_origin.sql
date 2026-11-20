-- MIG-04 (endurecimento, achado S2-4 da Security Engineer; decisão do Tech Lead, ADR 0003 §1): a origem da trilha
-- deixa de ser o 1º x-forwarded-for, que o cliente forja. `ip` passa a ser o x-atta-client-ip que o servidor do Next
-- manda (lido do x-forwarded-for da Vercel, que não se forja), e `ip_borda`, coluna nova, guarda o cf-connecting-ip
-- (posto pela Cloudflare, não se forja). Quem chama a Data API direto ainda forja o x-atta-client-ip, mas o ip_borda
-- mostra o IP real: a divergência é a pista (§19.10). O hash só ganha ip_borda quando ele existe, então todo evento
-- antigo continua verificando. Sempre para a frente.

set role audit_owner;

alter table audit.event add column ip_borda inet;

-- endereço único (IPv4 /32 ou IPv6 /128) ou nulo; faixa e texto inválido viram nulo
create function audit.single_ip(p text)
returns inet
language plpgsql
immutable
set search_path = ''
as $$
declare
  v inet;
begin
  if p is null or pg_catalog.length(p) > 64 then
    return null;
  end if;
  begin
    v := pg_catalog.btrim(p)::inet;
  exception when others then
    v := null;
  end;
  if v is null or pg_catalog.masklen(v) <> (case pg_catalog.family(v) when 4 then 32 else 128 end) then
    return null;
  end if;
  return v;
end
$$;
revoke all on function audit.single_ip(text) from public, anon, authenticated, service_role;

-- o texto do hash: o mesmo de antes, e a chave ip_borda só quando ela não é nula (evento antigo = hash igual)
create or replace function audit.event_digest(e audit.event)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to((pg_catalog.jsonb_build_object(
    'seq', e.seq, 'id', e.id,
    'created_at', pg_catalog.to_char(e.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'tenant_id', e.tenant_id, 'actor', e.actor, 'app_role', e.app_role, 'action', e.action,
    'entity', e.entity, 'entity_id', e.entity_id, 'details', e.details, 'before', e.before, 'after', e.after,
    'ip', pg_catalog.host(e.ip), 'request_id', e.request_id, 'prev_hash', e.prev_hash
  ) || case when e.ip_borda is null then '{}'::jsonb
            else pg_catalog.jsonb_build_object('ip_borda', pg_catalog.host(e.ip_borda)) end)::text, 'UTF8')), 'hex')
$$;

create or replace function audit.record_event(
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_details jsonb default '{}'::jsonb,
  p_before jsonb default null,
  p_after jsonb default null,
  p_tenant_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_scope text;
  v_token_tenant uuid := (select private.current_tenant_id());
  v_claims jsonb := coalesce(nullif(pg_catalog.current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  v_headers jsonb := coalesce(nullif(pg_catalog.current_setting('request.headers', true), ''), '{}')::jsonb;
  v_actor uuid;
  v_ip inet;
  v_ip_borda inet;
  v_head audit.chain_head;
  v_row audit.event;
begin
  select a.kind, a.scope into v_kind, v_scope from audit.action a where a.action = p_action;
  if v_kind is null then
    raise exception 'audit: ação desconhecida' using errcode = '22023';
  end if;
  if v_kind = 'access' and (p_before is not null or p_after is not null) then
    raise exception 'audit: before/after só em ação do tipo change' using errcode = '22023';
  end if;
  if p_details is not null and jsonb_typeof(p_details) <> 'object' then
    raise exception 'audit: p_details é um objeto' using errcode = '22023';
  end if;
  -- em qualquer nível (objeto aninhado e dentro de array): dado pessoal não entra no motivo (ADR 0003 §2; S4-1)
  if pg_catalog.jsonb_path_exists(coalesce(p_details, '{}'::jsonb),
       '$.** ? (@.type() == "object").keyvalue() ? (@.key like_regex "^(cpf|cpf_masked|rne|name|full_name|social_name|email|phone|whatsapp|nome|telefone|birth_date|data_nascimento|foreign_doc_.*|local_.*|.*_hmac|pin_mac|.*secret.*)$" flag "i")') then
    raise exception 'audit: chave proibida em p_details' using errcode = '22023';   -- sem eco do valor
  end if;
  -- antes e depois: identificador em claro e dado de saúde nunca entram, nem cifrados (ADR 0003 §2)
  if pg_catalog.jsonb_path_exists(coalesce(p_before, '{}'::jsonb) || coalesce(p_after, '{}'::jsonb),
       '$.** ? (@.type() == "object").keyvalue() ? (@.key like_regex "^(cpf|rne|.*_hmac|pin_mac|.*secret.*|value|value_enc|answers|respostas|dek_wrapped)$" flag "i")') then
    raise exception 'audit: chave proibida em p_before/p_after' using errcode = '22023';
  end if;
  -- valor com forma de CPF (com ou sem máscara de digitação) em qualquer lugar do texto, com limite de dígito (um CPF no
  -- meio de um motivo livre também conta). Ficam de fora os textos que são UUID ou hash hex, que têm corridas de dígitos
  -- por acaso e são justamente o que a trilha guarda nos details.
  if pg_catalog.jsonb_path_exists(
       pg_catalog.jsonb_build_array(coalesce(p_details, '{}'::jsonb), coalesce(p_before, '{}'::jsonb), coalesce(p_after, '{}'::jsonb)),
       '$.** ? (@.type() == "string"
                && @ like_regex "(^|[^0-9])[0-9]{3}[.]?[0-9]{3}[.]?[0-9]{3}-?[0-9]{2}([^0-9]|$)"
                && !(@ like_regex "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$" flag "i")
                && !(@ like_regex "^[0-9a-f]{32,}$" flag "i"))') then
    raise exception 'audit: valor com forma de CPF' using errcode = '22023';
  end if;
  if v_token_tenant is not null and p_tenant_id is not null and p_tenant_id <> v_token_tenant then
    raise exception 'audit: tenant divergente do token' using errcode = '42501';
  end if;
  -- sem tenant no token nem no parâmetro: só ação de rede (ADR 0003 §1, scope do catálogo)
  if v_scope = 'tenant' and v_token_tenant is null and p_tenant_id is null then
    raise exception 'audit: ação de clínica sem tenant' using errcode = '22023';
  end if;

  -- ator: o sub do token (mesma leitura do auth.uid(), sem depender do schema auth); valor que não é uuid vira nulo
  if (v_claims ->> 'sub') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_actor := (v_claims ->> 'sub')::uuid;
  end if;
  -- origem (S2-4, ADR 0003 §1): o IP que o servidor do Next declara em x-atta-client-ip (na Vercel, o x-forwarded-for
  -- não se forja), e à parte o IP da borda (cf-connecting-ip, posto pela Cloudflare). Nunca o 1º do x-forwarded-for.
  -- Só endereço único (não faixa); inválido vira nulo, sem derrubar a ação auditada.
  v_ip := audit.single_ip(v_headers ->> 'x-atta-client-ip');
  v_ip_borda := audit.single_ip(v_headers ->> 'cf-connecting-ip');

  -- uma cadeia só: a cabeça travada serializa quem grava (solta no commit); ver o comentário de audit.chain_head
  select * into v_head from audit.chain_head where id for update;

  v_row.seq := pg_catalog.nextval(pg_catalog.pg_get_serial_sequence('audit.event', 'seq'));
  v_row.id := gen_random_uuid();
  v_row.created_at := pg_catalog.date_trunc('microseconds', pg_catalog.clock_timestamp());
  v_row.tenant_id := coalesce(v_token_tenant, p_tenant_id);
  v_row.actor := v_actor;
  v_row.app_role := coalesce((select private.current_app_role()), 'system');
  v_row.action := p_action;
  v_row.entity := p_entity;
  v_row.entity_id := p_entity_id;
  v_row.details := coalesce(p_details, '{}'::jsonb);
  v_row.before := p_before;
  v_row.after := p_after;
  v_row.ip := v_ip;
  v_row.ip_borda := v_ip_borda;
  v_row.request_id := pg_catalog.left(v_headers ->> 'x-request-id', 128);
  v_row.prev_hash := v_head.last_hash;
  v_row.hash := audit.event_digest(v_row);

  insert into audit.event overriding system value
  select v_row.*;
  update audit.chain_head set last_seq = v_row.seq, last_hash = v_row.hash where id;
  return v_row.id;
end
$$;

reset role;
