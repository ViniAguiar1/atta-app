-- MIG-03 · sessão de no máximo 12 h (PDD v206 §19.8; tempos do dono em 20/11; ADR 0006). O [auth.sessions] do Supabase
-- exige plano pago, então a regra fica no app (proxy, src/lib/auth/sessao.ts) e também aqui: has_permission nega quando
-- o login do token (o mais antigo de amr[].timestamp) passou de 12 h, para valer também na Data API direta, fora do app.
-- Token sem amr (só existe em teste e em job sem JWT) não é barrado por esta regra. Sempre para a frente.
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
      when (select l.em from login l) < extract(epoch from pg_catalog.now()) - 43200 then false
      -- ADMIN só com o segundo fator no token (aal2): regra do dono, 20/11 (PLANO). Sem ele, nenhuma permissão.
      when m.app_role = 'ADMIN' then coalesce((select c.v ->> 'aal' from c), 'aal1') = 'aal2'
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
