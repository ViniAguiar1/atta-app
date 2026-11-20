-- Portão (ADR 0001 §3c): view nos nossos schemas só com security_invoker (sem isso ela roda com a role do dono e
-- passa por cima da RLS) e nenhuma materialized view em schema exposto (não tem RLS). Com autoteste.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select is_empty($$
    select format('%s.%s', n.nspname, c.relname)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'v'
       and n.nspname not in ('pg_catalog','information_schema','auth','storage','realtime','_realtime','supabase_functions','supabase_migrations','extensions','graphql','graphql_public','vault','net','pgsodium','pgsodium_masks','pgbouncer','cron','pgmq','_analytics','_supavisor','pgtle','tiger','topology')
       and n.nspname not like 'pg\_%'
       and not coalesce('security_invoker=true' = any (c.reloptions) or 'security_invoker=on' = any (c.reloptions), false)
$$, 'toda view fora dos schemas do Supabase tem security_invoker = true');

select is_empty($$
    select format('%s.%s', n.nspname, c.relname)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'm' and n.nspname in ('platform', 'documents', 'atta_in', 'api')
$$, 'nenhuma materialized view em schema exposto');

create view platform.view_sem_invoker as select 1 as x;
select is((select string_agg(t.x, ',') from (select format('%s.%s', n.nspname, c.relname)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'v'
       and n.nspname not in ('pg_catalog','information_schema','auth','storage','realtime','_realtime','supabase_functions','supabase_migrations','extensions','graphql','graphql_public','vault','net','pgsodium','pgsodium_masks','pgbouncer','cron','pgmq','_analytics','_supavisor','pgtle','tiger','topology')
       and n.nspname not like 'pg\_%'
       and not coalesce('security_invoker=true' = any (c.reloptions) or 'security_invoker=on' = any (c.reloptions), false)) t(x)), 'platform.view_sem_invoker',
  'o portão acusa a view sem security_invoker');

create materialized view atta_in.mv_exposta as select 1 as x;
select is((select string_agg(t.x, ',') from (select format('%s.%s', n.nspname, c.relname)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'm' and n.nspname in ('platform', 'documents', 'atta_in', 'api')) t(x)), 'atta_in.mv_exposta',
  'o portão acusa a materialized view em schema exposto');

select * from finish();
rollback;
