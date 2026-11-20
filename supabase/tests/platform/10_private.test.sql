-- O schema private (ADR 0001 §1, exceção única): USAGE para authenticated, porque a policy roda com a role de quem
-- consulta; EXECUTE só nas três funções das policies; anon e service_role fora.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select ok(has_schema_privilege('authenticated', 'private', 'USAGE'), 'authenticated usa o private (a policy precisa)');
select ok(not has_schema_privilege('anon', 'private', 'USAGE'), 'anon não entra no private');
select ok(not has_schema_privilege('service_role', 'private', 'USAGE'), 'service_role não entra no private');

select ok(has_function_privilege('authenticated', 'private.current_tenant_id()', 'EXECUTE'), 'authenticated executa current_tenant_id');
select ok(has_function_privilege('authenticated', 'private.current_app_role()', 'EXECUTE'), 'authenticated executa current_app_role');
select ok(has_function_privilege('authenticated', 'private.has_permission(text, text)', 'EXECUTE'), 'authenticated executa has_permission');

select is_empty($$
  select p.oid::regprocedure::text
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.oid not in ('private.current_tenant_id()'::regprocedure, 'private.current_app_role()'::regprocedure,
                       'private.has_permission(text, text)'::regprocedure)
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
$$, 'nenhuma outra função do private executável por authenticated');

select ok(not has_function_privilege('anon', 'private.has_permission(text, text)', 'EXECUTE'), 'anon não executa has_permission');
select is((select prosecdef from pg_proc where oid = 'private.current_tenant_id()'::regprocedure), false,
  'current_tenant_id é security invoker (só lê o JWT)');

select * from finish();
rollback;
