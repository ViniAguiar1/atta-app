-- MIG-03 · ADR 0001 §2: o Custom Access Token Hook. A cada emissão de token, o Supabase Auth chama esta função, que
-- põe no token os claims tenant_id (a clínica ativa) e app_role (ADMIN | COLABORADOR, PDD §10.4.3) a partir do vínculo
-- ativo em platform.membership. Nunca mexe no claim `role` (a role do Postgres). Sem vínculo ativo, tira os dois
-- claims, mesmo que tenham vindo no evento: quem não é membro sai sem clínica e as policies não deixam passar nada.
-- Mais de um vínculo ativo: por enquanto vale o mais antigo; a troca de clínica ativa tem ADR própria (ADR 0001).
create or replace function private.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := coalesce(event -> 'claims', '{}'::jsonb) - 'tenant_id' - 'app_role';
  v_user uuid;
  v_tenant uuid;
  v_role text;
begin
  begin
    v_user := (event ->> 'user_id')::uuid;
  exception when invalid_text_representation then
    v_user := null;
  end;

  select m.tenant_id, m.app_role
    into v_tenant, v_role
    from platform.membership m
    join platform.tenant t on t.id = m.tenant_id and t.deleted_at is null
   where m.user_id = v_user
     and m.status = 'active'
     and m.deleted_at is null
   order by m.created_at, m.id
   limit 1;

  if v_tenant is not null then
    v_claims := v_claims || jsonb_build_object('tenant_id', v_tenant::text, 'app_role', v_role);
  end if;
  return jsonb_set(event, '{claims}', v_claims);
end
$$;

-- Só o Supabase Auth chama o hook. Ele lê platform.membership como dono (postgres), sem grant para mais ninguém.
revoke all on function private.custom_access_token_hook(jsonb) from public, anon, authenticated, service_role;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- ADMIN só com o segundo fator (TOTP, aal2 no token): regra do dono (20/11, PLANO). A guarda do proxy só redireciona;
-- esta é a trava de verdade, porque o token também vale direto na Data API. O COLABORADOR não precisa de aal2.
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
      -- ADMIN só com o segundo fator no token (aal2): regra do dono, 20/11 (PLANO). Sem ele, nenhuma permissão.
      when m.app_role = 'ADMIN' then coalesce(
        nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal', 'aal1') = 'aal2'
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
