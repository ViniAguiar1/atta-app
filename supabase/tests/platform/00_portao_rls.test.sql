-- Portão (ADR 0001 §3a): toda tabela fora dos schemas do Supabase tem RLS ligada E forçada. Vale para todo schema,
-- inclusive um que alguém crie sem combinar. O segundo teste prova que o portão pega a tabela sem FORCE.
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select is_empty($$
  select format('%s.%s', n.nspname, c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind in ('r', 'p')
     and n.nspname not in ('pg_catalog','information_schema','auth','storage','realtime','_realtime','supabase_functions','supabase_migrations','extensions','graphql','graphql_public','vault','net','pgsodium','pgsodium_masks','pgbouncer','cron','pgmq','_analytics','_supavisor','pgtle','tiger','topology')
     and n.nspname not like 'pg\_%'
     and not (c.relrowsecurity and c.relforcerowsecurity)
$$, 'toda tabela fora dos schemas do Supabase tem RLS ENABLE e FORCE');

create table platform.tabela_sem_force (id int);
alter table platform.tabela_sem_force enable row level security;
select is(
  (select string_agg(t.x, ',') from (
    select format('%s.%s', n.nspname, c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind in ('r', 'p')
     and n.nspname not in ('pg_catalog','information_schema','auth','storage','realtime','_realtime','supabase_functions','supabase_migrations','extensions','graphql','graphql_public','vault','net','pgsodium','pgsodium_masks','pgbouncer','cron','pgmq','_analytics','_supavisor','pgtle','tiger','topology')
     and n.nspname not like 'pg\_%'
     and not (c.relrowsecurity and c.relforcerowsecurity)
  ) t(x)),
  'platform.tabela_sem_force',
  'o portão acusa a tabela com RLS ligada mas sem FORCE'
);

select * from finish();
rollback;
