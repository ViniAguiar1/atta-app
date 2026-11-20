-- Portão (ADR 0001 §3b): o schema public fica vazio e ninguém cria nada nele.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select is_empty($$
  select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
$$, 'public sem tabela, view, view materializada nem tabela estrangeira');

select ok(not has_schema_privilege('anon', 'public', 'CREATE'), 'anon não cria no public');
select ok(not has_schema_privilege('authenticated', 'public', 'CREATE'), 'authenticated não cria no public');
select ok(not has_schema_privilege('service_role', 'public', 'CREATE'), 'service_role não cria no public');

select * from finish();
rollback;
