-- MIG-06 · Equipe & Permissões (PDD v206 §10.4.3; ADR 0001 §2; ADR 0006 §3). Sempre para a frente.
--
-- PDD §10.4.3: "A conta tem no máximo 2 gestores: o titular e 1 gestor adicional (nível ADMIN)". O gestor adicional
-- "só consegue entrar no sistema depois que essa conferência for aprovada — até lá, aparece com status Pendente". "A
-- troca do Gestor titular, a alteração do CNPJ vinculado e a exclusão de outro gestor são ações protegidas, que exigem
-- nova conferência de identidade". Ações da tabela de membros: Convidar Usuário, Reenviar convite (se Pendente), Editar
-- acesso (matriz por módulo; "cada alteração fica no log de auditoria"), Suspender/Reativar e Excluir ("bloqueado para
-- o admin principal"). "Toda alteração de nível/exclusão é auditada com IP do operador."
--
-- Status: Ativo (active), Pendente (invited = convite enviado; pending_verification = gestor adicional aguardando a
-- conferência pela ATTA, ADR 0006), Suspenso (suspended) e rejected (conferência reprovada, ADR 0006). "Inativo" fica
-- fora até a PO definir (CTO, 20/11, item R7). O hook e o has_permission já só aceitam 'active'.
-- Troca de papel (promover e rebaixar) fica para um PR seguinte, com a regra que o CTO confirmar.
--
-- Erros: 42501 ATTA-AUTH-0004 (sem permissão), P0002 ATTA-CORE-0005 (não encontrado, também para outra clínica),
-- P0001 ATTA-IN-0001 (campo inválido, detail = campo), 23505 ATTA-IN-0002 (já existe) e P0001 ATTA-IN-0003 (o estado
-- não permite; detail = admin_limit | owner_protected | protected_action | status | role | self).

alter table platform.membership drop constraint membership_status_check,
  add constraint membership_status_check
    check (status in ('invited', 'pending_verification', 'active', 'suspended', 'rejected'));

-- Titular: o gestor com vínculo conferido no QSA (self-onboarding, MIG-17). Um por clínica, sempre ADMIN.
alter table platform.membership add column is_owner boolean not null default false,
  add constraint membership_owner_admin_ck check (not is_owner or app_role = 'ADMIN');
create unique index membership_owner_uq on platform.membership (tenant_id) where is_owner and deleted_at is null;

-- ---------------------------------------------------------------------------------------------------------------
-- Guarda no banco (vale para qualquer caminho, não só para as funções):
--  1. no máximo 2 ADMIN vivos por clínica (conta o pendente e o suspenso; o reprovado e o excluído, não);
--  2. o titular não é suspenso, excluído, rebaixado nem perde a marca de titular.
-- Trava a linha da clínica para dois convites simultâneos não passarem juntos do limite.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function private.membership_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from platform.tenant t where t.id = new.tenant_id for update;

  if tg_op = 'UPDATE' and old.is_owner and old.deleted_at is null and (
       new.is_owner is distinct from true or new.app_role <> 'ADMIN' or new.status <> 'active'
       or new.deleted_at is not null or new.tenant_id <> old.tenant_id or new.user_id <> old.user_id) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'owner_protected';
  end if;

  if new.app_role = 'ADMIN' and new.deleted_at is null and new.status <> 'rejected' and (
       select count(*) from platform.membership m
        where m.tenant_id = new.tenant_id and m.id <> new.id and m.app_role = 'ADMIN'
          and m.deleted_at is null and m.status <> 'rejected') >= 2 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'admin_limit';
  end if;
  return new;
end
$$;
create trigger membership_guard before insert or update on platform.membership
  for each row execute function private.membership_guard();

-- Ações no catálogo fechado da auditoria (ADR 0003): leitura é access; mudança é change. Escopo tenant.
insert into audit.action (action, kind) values
  ('team.list', 'access'),
  ('team.invite', 'change'),
  ('team.accept', 'change'),
  ('team.set_permissions', 'change'),
  ('team.suspend', 'change'),
  ('team.reactivate', 'change'),
  ('team.remove', 'change')
on conflict (action) do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- Auxiliares internas (sem EXECUTE para ninguém de fora)
-- ---------------------------------------------------------------------------------------------------------------
-- A matriz do vínculo como objeto: {"appointments": ["create","edit","view"], ...}
create or replace function private.team_permissions_of(p_membership_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(x.module, x.actions), '{}'::jsonb)
    from (select p.module, jsonb_agg(p.action order by p.action) as actions
            from platform.membership_permission p
           where p.membership_id = p_membership_id
           group by p.module) x
$$;

-- Troca a matriz inteira do vínculo. As constraints da tabela recusam par proibido (23514) e criar/editar sem ver.
create or replace function private.team_replace_permissions(p_membership_id uuid, p_tenant_id uuid, p_permissions jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_permissions is null or jsonb_typeof(p_permissions) <> 'object' or exists (
       select 1 from jsonb_each(p_permissions) e where jsonb_typeof(e.value) <> 'array') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'permissions';
  end if;
  delete from platform.membership_permission where membership_id = p_membership_id;
  insert into platform.membership_permission (tenant_id, membership_id, module, action, granted_by)
  select distinct p_tenant_id, p_membership_id, e.key, a.action, auth.uid()
    from jsonb_each(p_permissions) e, jsonb_array_elements_text(e.value) a(action);
end
$$;

-- O vínculo alvo, vivo e da clínica do token, travado para a mudança. Outra clínica = não encontrado.
create or replace function private.team_target(p_membership_id uuid)
returns platform.membership
language plpgsql
set search_path = ''
as $$
declare
  v platform.membership;
begin
  select * into v from platform.membership m
   where m.id = p_membership_id and m.tenant_id = private.current_tenant_id() and m.deleted_at is null
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'membership_id';
  end if;
  return v;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- api.team_list: a tabela "Membros da Equipe" (nome, e-mail, nível, permissões, status, último acesso). ADMIN.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function api.team_list()
returns table (membership_id uuid, user_id uuid, display_name text, email text, app_role text, status text,
               is_owner boolean, permissions jsonb, last_sign_in_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('team', 'view') then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  perform audit.record_event('team.list', 'platform.membership', null, '{}'::jsonb);
  return query
    select m.id, m.user_id, nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), u.email::text, m.app_role,
           m.status, m.is_owner,
           case when m.app_role = 'COLABORADOR' then private.team_permissions_of(m.id) end, u.last_sign_in_at
      from platform.membership m
      join auth.users u on u.id = m.user_id
     where m.tenant_id = private.current_tenant_id() and m.deleted_at is null
     order by m.is_owner desc, m.app_role, u.email;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- api.team_invite: cria o vínculo do convidado. O usuário vem do auth.admin.inviteUserByEmail, chamado antes pela
-- server action (src/server, secret key só no servidor). ADMIN nasce gestor adicional pending_verification (só entra
-- depois da conferência pela ATTA, ADR 0006); COLABORADOR nasce invited, com o padrão sugerido do §10.4.3 ou com a
-- matriz informada.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function api.team_invite(p_user_id uuid, p_app_role text, p_permissions jsonb default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.current_tenant_id();
  v_id uuid;
  v_status text;
begin
  if not private.has_permission('team', 'create') then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if p_app_role is null or p_app_role not in ('ADMIN', 'COLABORADOR') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'app_role';
  end if;
  if p_app_role = 'ADMIN' and p_permissions is not null then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'permissions';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'user_id';
  end if;

  v_status := case p_app_role when 'ADMIN' then 'pending_verification' else 'invited' end;
  begin
    insert into platform.membership (tenant_id, user_id, app_role, status)
    values (v_tenant, p_user_id, p_app_role, v_status)
    returning id into v_id;
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'ATTA-IN-0002', detail = 'user_id';
  end;
  if p_permissions is not null then
    perform private.team_replace_permissions(v_id, v_tenant, p_permissions);
  end if;

  perform audit.record_event('team.invite', 'platform.membership', v_id, '{}'::jsonb, null,
    jsonb_build_object('app_role', p_app_role, 'status', v_status,
                       'permissions', case when p_app_role = 'COLABORADOR' then private.team_permissions_of(v_id) end));
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- api.team_accept_invite: o próprio convidado (COLABORADOR) aceita, no /auth/callback depois de definir a senha
-- (rota do Backend 1). O token ainda não tem clínica (o hook só dá clínica a vínculo ativo), então a clínica vem do
-- vínculo. O gestor adicional não passa por aqui: só a aprovação da ATTA o ativa.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function api.team_accept_invite(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v platform.membership;
begin
  select * into v from platform.membership m
   where m.id = p_membership_id and m.user_id = auth.uid() and m.deleted_at is null
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'membership_id';
  end if;
  if v.status <> 'invited' then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'status';
  end if;
  update platform.membership set status = 'active' where id = v.id;
  perform audit.record_event('team.accept', 'platform.membership', v.id, '{}'::jsonb,
    jsonb_build_object('status', v.status), jsonb_build_object('status', 'active'), v.tenant_id);
end
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- api.team_set_permissions: "Editar acesso" do COLABORADOR (troca a matriz inteira), auditado com antes e depois.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function api.team_set_permissions(p_membership_id uuid, p_permissions jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v platform.membership;
  v_before jsonb;
begin
  if not private.has_permission('team', 'edit') then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  v := private.team_target(p_membership_id);
  if v.app_role <> 'COLABORADOR' then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'role';
  end if;
  v_before := private.team_permissions_of(v.id);
  perform private.team_replace_permissions(v.id, v.tenant_id, p_permissions);
  perform audit.record_event('team.set_permissions', 'platform.membership', v.id, '{}'::jsonb,
    jsonb_build_object('permissions', v_before), jsonb_build_object('permissions', private.team_permissions_of(v.id)));
end
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- api.team_suspend / api.team_reactivate. Ninguém suspende a si mesmo; o titular nunca (guarda no banco).
-- ---------------------------------------------------------------------------------------------------------------
create or replace function api.team_suspend(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v platform.membership;
begin
  if not private.has_permission('team', 'edit') then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  v := private.team_target(p_membership_id);
  if v.user_id = auth.uid() then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'self';
  end if;
  if v.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'status';
  end if;
  update platform.membership set status = 'suspended' where id = v.id;
  perform audit.record_event('team.suspend', 'platform.membership', v.id, '{}'::jsonb,
    jsonb_build_object('status', v.status), jsonb_build_object('status', 'suspended'));
end
$$;

create or replace function api.team_reactivate(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v platform.membership;
begin
  if not private.has_permission('team', 'edit') then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  v := private.team_target(p_membership_id);
  if v.status <> 'suspended' then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'status';
  end if;
  update platform.membership set status = 'active' where id = v.id;
  perform audit.record_event('team.reactivate', 'platform.membership', v.id, '{}'::jsonb,
    jsonb_build_object('status', v.status), jsonb_build_object('status', 'active'));
end
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- api.team_remove: exclusão lógica (PDD §9.6). Bloqueada para o titular; excluir outro gestor (ADMIN que já entrou)
-- é ação protegida (§10.4.3: nova conferência), feita só pela ATTA. Cancelar o convite de um gestor adicional ainda
-- pendente ou reprovado é permitido. Ninguém exclui a si mesmo por aqui.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function api.team_remove(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v platform.membership;
begin
  if not private.has_permission('team', 'edit') then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  v := private.team_target(p_membership_id);
  if v.user_id = auth.uid() then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'self';
  end if;
  if v.is_owner then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'owner_protected';
  end if;
  if v.app_role = 'ADMIN' and v.status in ('active', 'suspended') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'protected_action';
  end if;
  update platform.membership set deleted_at = now() where id = v.id;
  perform audit.record_event('team.remove', 'platform.membership', v.id, '{}'::jsonb,
    jsonb_build_object('status', v.status, 'app_role', v.app_role), jsonb_build_object('deleted', true));
end
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Grants (ADR 0001 §1): api.* para authenticated, nunca public nem anon; auxiliares de private para ninguém.
-- ---------------------------------------------------------------------------------------------------------------
revoke all on function api.team_list(), api.team_invite(uuid, text, jsonb), api.team_accept_invite(uuid),
  api.team_set_permissions(uuid, jsonb), api.team_suspend(uuid), api.team_reactivate(uuid), api.team_remove(uuid)
  from public, anon, authenticated, service_role;
grant execute on function api.team_list(), api.team_invite(uuid, text, jsonb), api.team_accept_invite(uuid),
  api.team_set_permissions(uuid, jsonb), api.team_suspend(uuid), api.team_reactivate(uuid), api.team_remove(uuid)
  to authenticated;
revoke all on function private.membership_guard(), private.team_permissions_of(uuid),
  private.team_replace_permissions(uuid, uuid, jsonb), private.team_target(uuid)
  from public, anon, authenticated, service_role;
