-- MIG-04 · ADR 0003 (contrato) e ADR 0001 §2 (dona sem BYPASSRLS): a trilha de auditoria append-only com hash
-- encadeado. Gabarito de compatibilidade: o stub do Backend 2 (migracao/gabaritos/mig-04-stub-audit-backend2.sql),
-- mesma tabela audit.action e mesma assinatura de audit.record_event. A âncora diária fora do banco é o MIG-05.
-- Sempre para a frente.

-- ---------------------------------------------------------------------------------------------------------------
-- Dona própria, sem login e sem BYPASSRLS: no Supabase o postgres tem BYPASSRLS, e FORCE não o restringe. O postgres
-- pode assumir a dona (SET, para migrations futuras), mas não herda os privilégios dela (INHERIT false): uma função
-- comum dona do postgres não altera a trilha por engano.
-- ---------------------------------------------------------------------------------------------------------------
create role audit_owner nologin nobypassrls noinherit;
grant audit_owner to postgres with inherit false, set true;
alter schema audit owner to audit_owner;
-- quem chama a trilha (funções de api, private e atta_in, donas do postgres) precisa enxergar o schema
grant usage on schema audit to postgres;
-- record_event lê o tenant e o papel do token pelas funções canônicas do MIG-02
grant usage on schema private to audit_owner;
grant execute on function private.current_tenant_id(), private.current_app_role() to audit_owner;

-- Daqui até o `reset role`, tudo nasce como a dona: tabelas, funções e gatilhos já são dela, sem CREATE para o postgres.
set role audit_owner;

-- ---------------------------------------------------------------------------------------------------------------
-- Catálogo fechado de ações (ADR 0003 §1). Ação nova entra por migration, no PR de quem a usa (insert como postgres).
-- ---------------------------------------------------------------------------------------------------------------
create table audit.action (
  action text primary key check (action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),   -- <entidade>.<verbo>
  kind text not null check (kind in ('access', 'change')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------------------------
-- A trilha. `seq` dá a ordem da cadeia; `hash` = SHA-256 do próprio evento com o `prev_hash` dentro.
-- ---------------------------------------------------------------------------------------------------------------
create table audit.event (
  seq bigint generated always as identity primary key,
  id uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default clock_timestamp(),
  tenant_id uuid,                          -- sem FK: a trilha sobrevive à clínica (eliminação é rotina própria)
  actor uuid,                              -- auth.uid(); nulo em job
  app_role text not null,                  -- ADMIN | COLABORADOR | system
  action text not null references audit.action (action),
  entity text not null check (entity ~ '^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$'),        -- schema.tabela
  entity_id uuid,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  before jsonb,
  after jsonb,
  ip inet,
  request_id text check (char_length(request_id) <= 128),
  prev_hash text not null check (prev_hash ~ '^[0-9a-f]{64}$'),
  hash text not null unique check (hash ~ '^[0-9a-f]{64}$')
);
create index event_tenant_created_idx on audit.event (tenant_id, created_at);
create index event_entity_idx on audit.event (entity, entity_id);

-- O texto que entra no hash: JSON com campos fixos e data em UTC com microssegundos (não depende do TimeZone da
-- sessão). O jsonb tem ordem de chaves determinística no Postgres, então o mesmo evento dá sempre o mesmo texto.
create function audit.event_digest(e audit.event)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
    'seq', e.seq, 'id', e.id,
    'created_at', pg_catalog.to_char(e.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'tenant_id', e.tenant_id, 'actor', e.actor, 'app_role', e.app_role, 'action', e.action,
    'entity', e.entity, 'entity_id', e.entity_id, 'details', e.details, 'before', e.before, 'after', e.after,
    'ip', pg_catalog.host(e.ip), 'request_id', e.request_id, 'prev_hash', e.prev_hash
  )::text, 'UTF8')), 'hex')
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Append-only: sem grant de UPDATE, DELETE e TRUNCATE para ninguém, sem policy de UPDATE e DELETE, e um gatilho que
-- recusa os três até para a dona (camada que não depende de grant).
-- ---------------------------------------------------------------------------------------------------------------
create function audit.reject_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'a trilha de auditoria é só de inserção (%)', tg_op using errcode = '42501';
end
$$;

create trigger event_append_only before update or delete on audit.event
  for each row execute function audit.reject_change();
create trigger event_no_truncate before truncate on audit.event
  for each statement execute function audit.reject_change();
-- o catálogo também não se altera nem se apaga: ação aposentada continua explicando eventos antigos
create trigger action_append_only before update or delete on audit.action
  for each row execute function audit.reject_change();
create trigger action_no_truncate before truncate on audit.action
  for each statement execute function audit.reject_change();

alter table audit.action enable row level security;
alter table audit.action force row level security;
alter table audit.event enable row level security;
alter table audit.event force row level security;

revoke all on audit.action, audit.event from public, anon, authenticated, service_role, postgres;
-- migrations (postgres) acrescentam ações e as leem; nada além disso
grant select, insert on audit.action to postgres;

create policy owner_reads_actions on audit.action for select to audit_owner using (true);
create policy owner_reads_events on audit.event for select to audit_owner using (true);
create policy owner_appends_events on audit.event for insert to audit_owner with check (true);

-- ---------------------------------------------------------------------------------------------------------------
-- audit.record_event (ADR 0003 §1 a §3). Preenche sozinha momento, ator, papel, tenant, IP, id de correlação e o elo.
-- ---------------------------------------------------------------------------------------------------------------
create function audit.record_event(
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
  v_token_tenant uuid := (select private.current_tenant_id());
  v_claims jsonb := coalesce(nullif(pg_catalog.current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  v_headers jsonb := coalesce(nullif(pg_catalog.current_setting('request.headers', true), ''), '{}')::jsonb;
  v_actor uuid;
  v_ip inet;
  v_prev text;
  v_row audit.event;
begin
  select a.kind into v_kind from audit.action a where a.action = p_action;
  if v_kind is null then
    raise exception 'audit: ação desconhecida' using errcode = '22023';
  end if;
  if v_kind = 'access' and (p_before is not null or p_after is not null) then
    raise exception 'audit: before/after só em ação do tipo change' using errcode = '22023';
  end if;
  if p_details is not null and jsonb_typeof(p_details) <> 'object' then
    raise exception 'audit: p_details é um objeto' using errcode = '22023';
  end if;
  if coalesce(p_details, '{}'::jsonb)
       ?| array['cpf', 'cpf_hmac', 'name', 'full_name', 'social_name', 'email', 'phone', 'nome', 'telefone'] then
    raise exception 'audit: chave proibida em p_details' using errcode = '22023';   -- sem eco do valor
  end if;
  if v_token_tenant is not null and p_tenant_id is not null and p_tenant_id <> v_token_tenant then
    raise exception 'audit: tenant divergente do token' using errcode = '42501';
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

  -- uma cadeia só: eventos simultâneos entram um de cada vez (trava da transação, solta no commit)
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('audit.event.chain', 0));
  select e.hash into v_prev from audit.event e order by e.seq desc limit 1;

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
  v_row.prev_hash := coalesce(v_prev, pg_catalog.repeat('0', 64));
  v_row.hash := audit.event_digest(v_row);

  insert into audit.event overriding system value
  select v_row.*;
  return v_row.id;
end
$$;

-- Confere a cadeia inteira: devolve o seq do primeiro evento que não bate (hash recalculado ou elo com o anterior),
-- ou nulo se está íntegra. Não detecta a remoção do último evento: isso é a âncora fora do banco (MIG-05).
create function audit.verify_chain()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select min(c.seq) from (
    select e.seq, e.hash, e.prev_hash, audit.event_digest(e) as recalculado,
           coalesce(lag(e.hash) over (order by e.seq), pg_catalog.repeat('0', 64)) as anterior
      from audit.event e
  ) c
  where c.hash <> c.recalculado or c.prev_hash <> c.anterior
$$;

-- EXECUTE só para o postgres (dono das funções de api, private e atta_in); ninguém mais chama direto.
revoke all on function audit.record_event(text, text, uuid, jsonb, jsonb, jsonb, uuid), audit.verify_chain(),
  audit.event_digest(audit.event), audit.reject_change() from public, anon, authenticated, service_role;
grant execute on function audit.record_event(text, text, uuid, jsonb, jsonb, jsonb, uuid), audit.verify_chain()
  to postgres;

reset role;
