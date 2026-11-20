-- MIG-06 · permissões finas por módulo do COLABORADOR (PDD v206 §10.4.3; contrato na ADR 0001 §2). Sempre para a frente.
--
-- PDD §10.4.3: o COLABORADOR tem "acesso definido pela própria clínica, módulo a módulo: para cada módulo (Agendamentos,
-- Pacientes, Termos & Docs, ATTA e Métricas) o gestor escolhe se a pessoa visualiza, cria e edita. Criar e editar exigem
-- visualizar [...]. Métricas e ATTA têm só 'visualizar'. Auditoria, Configurações e Equipe & Permissões são sempre
-- exclusivas do ADMIN, nunca liberáveis ao Colaborador. [...] Padrão sugerido ao convidar: Agendamentos e Pacientes
-- (ver, criar, editar) e ATTA (ver)."
--
-- Uma linha por (vínculo, módulo, ação): a presença da linha é a permissão. Nada de linha, nada de acesso (falha
-- fechada). O ADMIN não usa a matriz: passa em tudo (com aal2 e dentro das 12 h, como no MIG-03).
-- Escrita só por função em `api` (MIG-06, PR seguinte: api.team_set_permissions, auditada); pela tabela, só leitura.

-- (id, tenant_id) único em membership, para a FK composta garantir que a permissão é da mesma clínica do vínculo.
alter table platform.membership add constraint membership_id_tenant_uq unique (id, tenant_id);

create table platform.membership_permission (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenant (id),
  membership_id uuid not null,
  module text not null,
  action text not null check (action in ('view', 'create', 'edit')),
  granted_by uuid references auth.users (id) on delete restrict, -- nulo = padrão aplicado pelo sistema
  granted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (membership_id, tenant_id) references platform.membership (id, tenant_id) on delete restrict,
  -- par módulo × ação do PDD: atta e metrics só com view; settings, team e audit nunca entram na matriz
  constraint membership_permission_module_action_ck check (
    module in ('appointments', 'patients', 'documents')
    or (module in ('atta', 'metrics') and action = 'view')
  )
);
create unique index membership_permission_uq
  on platform.membership_permission (tenant_id, membership_id, module, action);
create index membership_permission_membership_id_idx on platform.membership_permission (membership_id);

-- "Criar e editar exigem visualizar": checado no fim de cada comando (dá para gravar view e create no mesmo INSERT) e
-- também ao apagar o view de quem ainda tem create ou edit.
create or replace function private.membership_permission_requires_view()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  r record := coalesce(new, old);
begin
  if exists (
       select 1 from platform.membership_permission p
        where p.membership_id = r.membership_id and p.module = r.module and p.action in ('create', 'edit'))
     and not exists (
       select 1 from platform.membership_permission p
        where p.membership_id = r.membership_id and p.module = r.module and p.action = 'view') then
    raise exception 'criar e editar exigem visualizar (módulo %)', r.module using errcode = '23514';
  end if;
  return null;
end
$$;
create constraint trigger membership_permission_requires_view
  after insert or update or delete on platform.membership_permission
  deferrable initially immediate
  for each row execute function private.membership_permission_requires_view();

-- Padrão sugerido ao convidar (PDD §10.4.3), aplicado quando o vínculo nasce COLABORADOR ou passa a ser. Quem convida
-- ajusta a matriz depois, na mesma transação, por api.team_set_permissions. Não sobrescreve linha que já existe.
create or replace function private.membership_default_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.app_role = 'COLABORADOR' and (tg_op = 'INSERT' or old.app_role is distinct from new.app_role) then
    insert into platform.membership_permission (tenant_id, membership_id, module, action)
    values (new.tenant_id, new.id, 'appointments', 'view'),
           (new.tenant_id, new.id, 'appointments', 'create'),
           (new.tenant_id, new.id, 'appointments', 'edit'),
           (new.tenant_id, new.id, 'patients', 'view'),
           (new.tenant_id, new.id, 'patients', 'create'),
           (new.tenant_id, new.id, 'patients', 'edit'),
           (new.tenant_id, new.id, 'atta', 'view')
    on conflict (tenant_id, membership_id, module, action) do nothing;
  end if;
  return null;
end
$$;
create trigger membership_default_permissions
  after insert or update of app_role on platform.membership
  for each row execute function private.membership_default_permissions();

-- ---------------------------------------------------------------------------------------------------------------
-- RLS forçada e grants mínimos (ADR 0001 §2). Leitura: a própria matriz (a tela decide as abas) e, para quem tem o
-- módulo team (ADMIN), a da equipe. Nenhuma escrita pela tabela.
-- ---------------------------------------------------------------------------------------------------------------
alter table platform.membership_permission enable row level security;
alter table platform.membership_permission force row level security;
revoke all on platform.membership_permission from public, anon, authenticated, service_role;
grant select on platform.membership_permission to authenticated;

create policy membership_permission_select on platform.membership_permission for select to authenticated
  using (
    tenant_id = (select private.current_tenant_id())
    and (
      exists (
        select 1 from platform.membership m
         where m.id = membership_permission.membership_id
           and m.user_id = (select auth.uid()) and m.status = 'active' and m.deleted_at is null)
      or (select private.has_permission('team', 'view'))
    )
  );

-- ---------------------------------------------------------------------------------------------------------------
-- has_permission real: mesma assinatura e mesmas regras do MIG-03 (vínculo ativo, clínica viva, 12 h desde o login,
-- aal2 do ADMIN); o COLABORADOR passa só com a linha da matriz (e com o view, para create e edit).
-- ---------------------------------------------------------------------------------------------------------------
create or replace function private.has_permission(p_module text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select coalesce(nullif(pg_catalog.current_setting('request.jwt.claims', true), ''), '{}')::jsonb as v
  ), login as (
    select pg_catalog.min((e ->> 'timestamp')::bigint) as em
      from c, pg_catalog.jsonb_array_elements(
             case when pg_catalog.jsonb_typeof(c.v -> 'amr') = 'array' then c.v -> 'amr' else '[]'::jsonb end) e
     where e ->> 'timestamp' ~ '^[0-9]{1,12}$'
  )
  select coalesce((
    select case
      when p_module not in ('appointments', 'patients', 'documents', 'atta', 'metrics', 'settings', 'team', 'audit')
        or p_action not in ('view', 'create', 'edit') then false
      -- sessão com mais de 12 h desde o login: nenhuma permissão (o proxy já manda para /login)
      when coalesce((select l.em from login l), 0) < extract(epoch from pg_catalog.now()) - 43200 then false
      -- ADMIN só com o segundo fator no token (aal2): regra do dono, 20/11 (PLANO). Sem ele, nenhuma permissão.
      when m.app_role = 'ADMIN' then coalesce((select c.v ->> 'aal' from c), 'aal1') = 'aal2'
      -- COLABORADOR: só o que a clínica liberou na matriz (PDD §10.4.3). settings, team e audit nunca.
      when m.app_role = 'COLABORADOR' then
        p_module in ('appointments', 'patients', 'documents', 'atta', 'metrics')
        and exists (
          select 1 from platform.membership_permission p
           where p.membership_id = m.id and p.tenant_id = m.tenant_id
             and p.module = p_module and p.action = p_action)
        and (p_action = 'view' or exists (
          select 1 from platform.membership_permission p
           where p.membership_id = m.id and p.tenant_id = m.tenant_id
             and p.module = p_module and p.action = 'view'))
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

-- As funções novas de private não são chamáveis por ninguém de fora (só pelos gatilhos).
revoke all on function private.membership_permission_requires_view(), private.membership_default_permissions()
  from public, anon, authenticated, service_role;
