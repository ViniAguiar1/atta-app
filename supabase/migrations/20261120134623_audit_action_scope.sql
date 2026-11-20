-- MIG-04 (follow-up) · ADR 0003 §1: o catálogo diz se a ação é de clínica ou de rede, e o record_event recusa evento sem
-- tenant quando a ação é de clínica. O padrão 'tenant' mantém as ações já cadastradas (decisão do Tech Lead).
-- Fluxo de paciente, de profissional e job sempre passam p_tenant_id. Sempre para a frente.

set role audit_owner;

alter table audit.action
  add column scope text not null default 'tenant' check (scope in ('tenant', 'network'));

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
  -- em qualquer nível: objeto aninhado e objeto dentro de array também contam
  if pg_catalog.jsonb_path_exists(coalesce(p_details, '{}'::jsonb),
       '$.** ? (@.type() == "object").keyvalue() ? (@.key like_regex "^(cpf|cpf_hmac|name|full_name|social_name|email|phone|nome|telefone)$")') then
    raise exception 'audit: chave proibida em p_details' using errcode = '22023';   -- sem eco do valor
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
  -- IP: o primeiro do x-forwarded-for; inválido vira nulo, sem derrubar a ação auditada
  begin
    v_ip := pg_catalog.btrim(pg_catalog.split_part(v_headers ->> 'x-forwarded-for', ',', 1))::inet;
  exception when others then
    v_ip := null;
  end;

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
