-- MIG-02 · ADR 0001 §1 e §2: clínica (tenant, com a árvore Conta → Grupo → Unidade), vínculo do usuário com a
-- clínica e o papel (membership), as funções das policies e a regra canônica de RLS. Sempre para a frente.

-- ---------------------------------------------------------------------------------------------------------------
-- Funções das policies (schema private, fora da Data API). A policy roda com a role de quem consulta, por isso o
-- private ganha USAGE para authenticated (exceção única da ADR 0001 §1) e EXECUTE só nestas três.
-- ---------------------------------------------------------------------------------------------------------------

-- A clínica ativa do token (claim tenant_id, posto pelo Custom Access Token Hook no MIG-03). Sem claim, ou com um
-- valor que não é uuid, devolve nulo e nenhuma linha passa pela policy: falha fechada.
create or replace function private.current_tenant_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select case when c.v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then c.v::uuid end
  from (select coalesce(nullif(pg_catalog.current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'tenant_id' as v) c
$$;

-- O papel do token (claim app_role: ADMIN | COLABORADOR, PDD §10.4.3). Valor fora da lista vira nulo. Nunca o claim
-- `role`, que é a role do Postgres.
create or replace function private.current_app_role()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case when c.v in ('ADMIN', 'COLABORADOR') then c.v end
  from (select coalesce(nullif(pg_catalog.current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'app_role' as v) c
$$;

-- updated_at em todo UPDATE (gatilho; não precisa de EXECUTE para quem altera a linha).
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- platform.tenant: o estabelecimento (PDD §9.6, Anexo B). A Unidade é uma conta completa, então é um tenant; a árvore
-- vem por parent_tenant_id (N níveis no modelo, 2 ativos, PDD §4.8). O isolamento é sempre pela Unidade.
-- ---------------------------------------------------------------------------------------------------------------
create table platform.tenant (
  id uuid primary key default gen_random_uuid(),
  parent_tenant_id uuid references platform.tenant (id),
  kind text not null default 'unit' check (kind in ('account', 'group', 'unit')),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  cnpj text unique check (cnpj ~ '^[0-9]{14}$'),
  timezone text not null default 'America/Sao_Paulo' check (timezone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+)+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (parent_tenant_id is distinct from id)
);
create index tenant_parent_tenant_id_idx on platform.tenant (parent_tenant_id);
create trigger tenant_set_updated_at before update on platform.tenant
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------------------------------------------
-- platform.membership: o usuário (auth.users) na clínica, com o papel. Um vínculo vivo por (clínica, usuário);
-- remover é lógico (deleted_at, PDD §9.6).
-- ---------------------------------------------------------------------------------------------------------------
create table platform.membership (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenant (id),
  user_id uuid not null references auth.users (id) on delete restrict, -- excluir usuário é rotina do MIG-06, sem perder o histórico
  app_role text not null check (app_role in ('ADMIN', 'COLABORADOR')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index membership_tenant_user_live_uq on platform.membership (tenant_id, user_id) where deleted_at is null;
create index membership_user_id_idx on platform.membership (user_id); -- o hook do MIG-03 busca por usuário
create trigger membership_set_updated_at before update on platform.membership
  for each row execute function private.set_updated_at();

-- Permissão por módulo e ação (PDD §10.4.3; stub até o MIG-06). Confere no banco que o usuário do token ainda tem
-- vínculo ativo com a clínica do token: tirar alguém da clínica corta o acesso na hora, sem esperar o token vencer.
-- O papel que vale é o do banco (o do token serve à tela). ADMIN passa em tudo; settings, team e audit são só do
-- ADMIN; COLABORADOR fica liberado nos outros módulos até o MIG-06. Módulo ou ação desconhecidos: false.
create or replace function private.has_permission(p_module text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when p_module not in ('appointments', 'patients', 'documents', 'atta', 'metrics', 'settings', 'team', 'audit')
        or p_action not in ('view', 'create', 'edit') then false
      when m.app_role = 'ADMIN' then true
      when m.app_role = 'COLABORADOR' then p_module in ('appointments', 'patients', 'documents', 'atta', 'metrics')
      else false
    end
    from platform.membership m
    join platform.tenant t on t.id = m.tenant_id and t.deleted_at is null
    where m.user_id = (select auth.uid())
      and m.tenant_id = (select private.current_tenant_id())
      and m.status = 'active'
      and m.deleted_at is null
  ), false)
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- RLS forçada e grants explícitos e mínimos (ADR 0001 §2). anon não tem grant em tabela nenhuma.
-- ---------------------------------------------------------------------------------------------------------------
alter table platform.tenant enable row level security;
alter table platform.tenant force row level security;
alter table platform.membership enable row level security;
alter table platform.membership force row level security;

revoke all on platform.tenant, platform.membership from public, anon, authenticated, service_role;
-- tenant: ler a própria clínica; o ADMIN muda o nome e o fuso. Criar clínica é do onboarding (MIG-17), por função.
grant select on platform.tenant to authenticated;
grant update (name, timezone) on platform.tenant to authenticated;
-- membership: só leitura pela tabela. Convite, troca de papel, suspensão e remoção entram por função em `api` no MIG-06,
-- com as regras que a tabela não garante (no máximo 2 ADMIN, titular protegido, PDD §10.4.3).
grant select on platform.membership to authenticated;

-- Toda policy de staff confere o vínculo ativo (ADR 0001 §2): removido ou suspenso perde o acesso na hora, mesmo
-- com o token ainda válido.
create policy tenant_select on platform.tenant for select to authenticated
  using (
    id = (select private.current_tenant_id())
    and deleted_at is null
    and exists (
      select 1 from platform.membership m
       where m.tenant_id = tenant.id and m.user_id = (select auth.uid()) and m.status = 'active' and m.deleted_at is null
    )
  );
create policy tenant_update on platform.tenant for update to authenticated
  using (id = (select private.current_tenant_id()) and (select private.has_permission('settings', 'edit')))
  with check (id = (select private.current_tenant_id()));

-- O próprio vínculo ativo todos veem (a tela sabe o papel); a equipe inteira, só quem tem o módulo team (ADMIN).
-- has_permission já confere o vínculo ativo; o caminho do "próprio" confere pelo status e pelo deleted_at da linha.
create policy membership_select on platform.membership for select to authenticated
  using (
    tenant_id = (select private.current_tenant_id())
    and deleted_at is null
    and (
      (user_id = (select auth.uid()) and status = 'active')
      or (select private.has_permission('team', 'view'))
    )
  );

-- ---------------------------------------------------------------------------------------------------------------
-- private: USAGE para authenticated (a policy precisa), EXECUTE só nas três funções das policies.
-- ---------------------------------------------------------------------------------------------------------------
grant usage on schema private to authenticated;
revoke all on all functions in schema private from public, anon, authenticated, service_role;
grant execute on function private.current_tenant_id(), private.current_app_role(),
  private.has_permission(text, text) to authenticated;
