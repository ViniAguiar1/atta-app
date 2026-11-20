-- MIG-03 · login, falha de login, 2º fator, sair e sessão encerrada por tempo na trilha (auditoria de segurança S3-5;
-- PDD v206 §10.4.3: a Auditoria registra "login [...] tentativa de acesso suspeita"; ADR 0003 §1b). Sempre para a frente.
--
-- Quem grava é só o servidor do Next (EXECUTE só para service_role), depois de conferir a sessão: com a sessão, a
-- própria pessoa poderia gravar um auth.login ou auth.mfa_verified falso sobre si pela Data API (decisão do Tech Lead,
-- ADR 0003 §1b). O servidor passa o sub verificado; a clínica e o papel saem do vínculo no banco, nunca do chamador.
-- p_details fechado em method, aal e reason (texto curto). A falha de login não leva identificador (nem o e-mail).

insert into audit.action (action, kind, scope) values
  ('auth.login', 'access', 'network'),
  ('auth.login_failed', 'access', 'network'),
  ('auth.mfa_enrolled', 'access', 'network'),
  ('auth.mfa_verified', 'access', 'network'),
  ('auth.logout', 'access', 'network'),
  ('auth.session_expired', 'access', 'network')
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
  if p_action is null or p_action not in ('auth.login', 'auth.login_failed', 'auth.mfa_enrolled', 'auth.mfa_verified', 'auth.logout', 'auth.session_expired') then
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

revoke all on function api.audit_auth_event(text, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function api.audit_auth_event(text, uuid, jsonb) to service_role;
