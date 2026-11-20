-- Portões globais de segurança (Segurança; ADR 0001 §1 e §2, ADR 0003 §3, ADR 0004 §1; PDD v206 §19.3 e §19.4).
-- Valem para toda função, tabela e policy dos nossos schemas, inclusive as que ainda vão nascer: o teste função a
-- função de cada item continua, e este pega o que um PR esquecer. Cada portão tem autoteste no fim: um objeto errado,
-- criado só nesta transação, tem de ser acusado. Exceção nova a qualquer lista daqui: só com o ok da Segurança e do TL.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- os 10 schemas da ADR 0001 §1 e, entre eles, os fechados (fora da Data API)
create temp table seg_schemas (nome text primary key, fechado boolean not null) on commit drop;
insert into seg_schemas values
  ('platform', false), ('documents', false), ('atta_in', false), ('api', false),
  ('network', true), ('health', true), ('audit', true), ('integrations', true), ('billing', true), ('private', true);
grant select on seg_schemas to public;

-- funções de policy que authenticated executa (ADR 0001 §1; ADR 0006 §2 soma private.is_atta_staff quando entrar)
create temp table seg_funcoes_de_policy (nome text primary key) on commit drop;
insert into seg_funcoes_de_policy values
  ('private.current_tenant_id()'), ('private.current_app_role()'), ('private.has_permission(text, text)'),
  ('private.is_atta_staff(text)');
grant select on seg_funcoes_de_policy to public;

-- As consultas dos portões, uma vez só: o teste de verdade e o autoteste usam as mesmas.
create function pg_temp.seg_definer_sem_search_path() returns setof text language sql as $$
  select p.oid::regprocedure::text
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in (select nome from seg_schemas)
     and p.prosecdef
     and not coalesce(p.proconfig @> array['search_path=""'], false)
$$;
create function pg_temp.seg_funcao_sem_search_path() returns setof text language sql as $$
  select p.oid::regprocedure::text
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in (select nome from seg_schemas)
     and p.prokind in ('f', 'p')
     and not coalesce(p.proconfig @> array['search_path=""'], false)
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
$$;
create function pg_temp.seg_executavel_por_anon() returns setof text language sql as $$
  select p.oid::regprocedure::text
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in (select nome from seg_schemas)
     and (has_function_privilege('anon', p.oid, 'EXECUTE')
          or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                      where a.grantee = 0 and a.privilege_type = 'EXECUTE'))
$$;
create function pg_temp.seg_fechado_executavel_por_authenticated() returns setof text language sql as $$
  select p.oid::regprocedure::text
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in (select nome from seg_schemas where fechado)
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and p.oid::regprocedure::text not in (select nome from seg_funcoes_de_policy)
$$;
create function pg_temp.seg_tabela_de_anon() returns setof text language sql as $$
  select format('%s.%s', n.nspname, c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in (select nome from seg_schemas)
     and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and (has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
          or has_any_column_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES'))
$$;
create function pg_temp.seg_sequencia_de_anon() returns setof text language sql as $$
  select format('%s.%s', n.nspname, c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in (select nome from seg_schemas)
     and c.relkind = 'S'
     and has_sequence_privilege('anon', c.oid, 'USAGE, SELECT, UPDATE')
$$;
-- service_role tem BYPASSRLS no Supabase: grant de tabela para ele é leitura sem RLS. O fluxo de link e a fila usam
-- funções em `api` (ADR 0004 §1; ADR 0005 §1), nunca tabela.
create function pg_temp.seg_tabela_de_service_role() returns setof text language sql as $$
  select format('%s.%s', n.nspname, c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in (select nome from seg_schemas)
     and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and (has_table_privilege('service_role', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
          or has_any_column_privilege('service_role', c.oid, 'SELECT, INSERT, UPDATE'))
$$;
create function pg_temp.seg_policy_aberta() returns setof text language sql as $$
  select format('%s.%s: %s', schemaname, tablename, policyname)
    from pg_policies
   where schemaname in (select nome from seg_schemas)
     and roles && array['public', 'anon']::name[]
$$;
-- tabela de clínica em schema exposto: toda policy para authenticated amarra o tenant do token
create function pg_temp.seg_policy_sem_tenant() returns setof text language sql as $$
  select format('%s.%s: %s', p.schemaname, p.tablename, p.policyname)
    from pg_policies p
   where p.schemaname in (select nome from seg_schemas where not fechado)
     and exists (select 1 from information_schema.columns c
                  where c.table_schema = p.schemaname and c.table_name = p.tablename and c.column_name = 'tenant_id')
     and coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') not like '%current_tenant_id()%'
$$;
create function pg_temp.seg_grant_de_escrita_sem_policy() returns setof text language sql as $$
  select format('%s.%s (%s)', n.nspname, c.relname, priv)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   cross join unnest(array['INSERT', 'UPDATE', 'DELETE']) priv
   where n.nspname in (select nome from seg_schemas)
     and c.relkind in ('r', 'p')
     and (has_table_privilege('authenticated', c.oid, priv)
          or (priv <> 'DELETE' and has_any_column_privilege('authenticated', c.oid, priv)))
     and not exists (select 1 from pg_policies p
                      where p.schemaname = n.nspname and p.tablename = c.relname
                        and p.cmd in (priv, 'ALL') and p.roles && array['authenticated']::name[])
$$;

-- 1 a 9: o estado atual da main
select is_empty($$ select * from pg_temp.seg_definer_sem_search_path() $$,
  'toda função SECURITY DEFINER dos nossos schemas tem search_path vazio');
select is_empty($$ select * from pg_temp.seg_funcao_sem_search_path() $$,
  'toda função dos nossos schemas (inclusive gatilho e invoker) tem search_path vazio');
select is_empty($$ select * from pg_temp.seg_executavel_por_anon() $$,
  'nenhuma função dos nossos schemas executável por anon ou PUBLIC');
select is_empty($$ select * from pg_temp.seg_fechado_executavel_por_authenticated() $$,
  'authenticated só executa, nos schemas fechados, as funções de policy');
select is_empty($$ select * from pg_temp.seg_tabela_de_anon() $$,
  'anon sem privilégio em tabela, view ou coluna dos nossos schemas');
select is_empty($$ select * from pg_temp.seg_sequencia_de_anon() $$,
  'anon sem privilégio em sequência dos nossos schemas');
select is_empty($$ select * from pg_temp.seg_tabela_de_service_role() $$,
  'service_role (BYPASSRLS) sem grant de tabela nos nossos schemas: o acesso dele é por função em api');
select is_empty($$ select * from pg_temp.seg_policy_aberta() $$,
  'nenhuma policy para anon ou public nos nossos schemas');
select is_empty($$ select * from pg_temp.seg_policy_sem_tenant() $$,
  'toda policy de tabela de clínica em schema exposto amarra o tenant do token');

-- 10: grant de escrita sem policy de escrita seria só um erro de permissão hoje, mas vira buraco quando alguém criar
-- uma policy "ALL" frouxa; o portão exige que a escrita concedida tenha policy explícita
select is_empty($$ select * from pg_temp.seg_grant_de_escrita_sem_policy() $$,
  'todo grant de escrita para authenticated tem policy de escrita para authenticated');

-- 11 a 16: autoteste, com objetos errados que só existem nesta transação
create function api.seg_autoteste_definer() returns int language sql security definer as $$ select 1 $$;
select is((select string_agg(x, ',') from pg_temp.seg_definer_sem_search_path() x where x like '%seg_autoteste%'),
  'api.seg_autoteste_definer()', 'o portão acusa SECURITY DEFINER sem search_path');

grant execute on function api.seg_autoteste_definer() to public;
select is((select string_agg(x, ',') from pg_temp.seg_executavel_por_anon() x where x like '%seg_autoteste%'),
  'api.seg_autoteste_definer()', 'o portão acusa função executável por PUBLIC');

create function audit.seg_autoteste_fechado() returns int language sql set search_path = '' as $$ select 1 $$;
revoke all on function audit.seg_autoteste_fechado() from public;
grant execute on function audit.seg_autoteste_fechado() to authenticated;
select is((select string_agg(x, ',') from pg_temp.seg_fechado_executavel_por_authenticated() x where x like '%seg_autoteste%'),
  'audit.seg_autoteste_fechado()', 'o portão acusa função de schema fechado executável por authenticated');

create table atta_in.seg_autoteste (id int, tenant_id uuid);
alter table atta_in.seg_autoteste enable row level security;
alter table atta_in.seg_autoteste force row level security;
grant select (id) on atta_in.seg_autoteste to anon;
grant select on atta_in.seg_autoteste to service_role;
select is((select string_agg(x, ',') from pg_temp.seg_tabela_de_anon() x where x like '%seg_autoteste%')
          || '|' || (select string_agg(x, ',') from pg_temp.seg_tabela_de_service_role() x where x like '%seg_autoteste%'),
  'atta_in.seg_autoteste|atta_in.seg_autoteste', 'o portão acusa grant de coluna para anon e de tabela para service_role');

create policy seg_aberta on atta_in.seg_autoteste for select using (true);
select is((select string_agg(x, ',') from pg_temp.seg_policy_aberta() x where x like '%seg_autoteste%')
          || '|' || (select string_agg(x, ',') from pg_temp.seg_policy_sem_tenant() x where x like '%seg_autoteste%'),
  'atta_in.seg_autoteste: seg_aberta|atta_in.seg_autoteste: seg_aberta',
  'o portão acusa policy para public e policy de clínica sem o tenant do token');

grant insert on atta_in.seg_autoteste to authenticated;
select is((select string_agg(x, ',') from pg_temp.seg_grant_de_escrita_sem_policy() x where x like '%seg_autoteste%'),
  'atta_in.seg_autoteste (INSERT)', 'o portão acusa grant de escrita sem policy de escrita');

select * from finish();
rollback;
