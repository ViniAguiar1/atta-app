-- MIG-03d · senha nova gravada pelo link do e-mail (recuperação ou convite) na trilha (auditoria de segurança S3-5;
-- pedido da Segurança no #63). Mesma porta do #64 (api.audit_auth_event, só service_role); só acrescenta a ação.
-- Sempre para a frente.

insert into audit.action (action, kind, scope) values ('auth.password_reset', 'change', 'network')
on conflict (action) do nothing;

create or replace function api.audit_auth_event(p_action text, p_user_id uuid default null, p_details jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_role text;
begin
  if p_action is null or p_action not in ('auth.login', 'auth.login_failed', 'auth.mfa_enrolled', 'auth.mfa_verified', 'auth.logout', 'auth.session_expired', 'auth.password_reset') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'action';
  end if;
  if p_details is null or pg_catalog.jsonb_typeof(p_details) <> 'object' or exists (
       select 1 from pg_catalog.jsonb_each(p_details) e
        where e.key not in ('method', 'aal', 'reason') or pg_catalog.jsonb_typeof(e.value) <> 'string'
           or pg_catalog.char_length(e.value #>> '{}') > 40) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'details';
  end if;
  -- a falha de login não identifica a conta; os outros eventos são sempre de uma pessoa
  if (p_action = 'auth.login_failed') <> (p_user_id is null) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'user_id';
  end if;

  -- o autor do evento tem de existir: um id trocado ou de outro ambiente não vira autor falso na trilha (§19.6)
  if p_user_id is not null and not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'user_id';
  end if;

  if p_user_id is not null then
    -- a clínica e o papel do vínculo ativo mais antigo, como o hook do token (MIG-03a)
    select m.tenant_id, m.app_role into v_tenant, v_role
      from platform.membership m
      join platform.tenant t on t.id = m.tenant_id and t.deleted_at is null
     where m.user_id = p_user_id and m.status = 'active' and m.deleted_at is null
     order by m.created_at
     limit 1;
    perform pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
      'sub', p_user_id, 'role', 'authenticated', 'tenant_id', v_tenant, 'app_role', v_role)::text, true);
  else
    perform pg_catalog.set_config('request.jwt.claims', '', true);
  end if;
  return audit.record_event(p_action, 'auth.users', p_user_id, p_details);
end
$$;
