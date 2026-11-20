-- S3-5: login, falha, 2º fator, sair e sessão encerrada na trilha. Só o servidor (service_role) grava; a clínica e o
-- papel vêm do vínculo no banco, nunca do chamador. Só dados fictícios; tudo desfeito no rollback.
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to service_role, authenticated;
select plan(15);

insert into auth.users (id, email, aud, role) values
  ('a1a1a1a1-0000-4000-8000-0000000000a1', 'trilha.login@exemplo.test', 'authenticated', 'authenticated'),
  ('f5f5f5f5-0000-4000-8000-0000000000f5', 'sem.clinica@exemplo.test', 'authenticated', 'authenticated');
insert into platform.tenant (id, name) values ('aaaaaaaa-0000-4000-8000-000000000001', 'Clínica Alfa');
insert into platform.membership (tenant_id, user_id, app_role)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-0000000000a1', 'ADMIN');

select ok(has_function_privilege('service_role', 'api.audit_auth_event(text,uuid,jsonb)', 'EXECUTE'), 'o servidor (service_role) grava');
select ok(not has_function_privilege('authenticated', 'api.audit_auth_event(text,uuid,jsonb)', 'EXECUTE'), 'quem tem sessão não grava evento sobre si');
select ok(not has_function_privilege('anon', 'api.audit_auth_event(text,uuid,jsonb)', 'EXECUTE'), 'anon não grava');

set local role service_role;
-- o chamador forja clínica e papel no token: não valem, o banco lê o vínculo
select set_config('request.jwt.claims', '{"role":"service_role","tenant_id":"bbbbbbbb-0000-4000-8000-000000000002","app_role":"COLABORADOR"}', true);
select lives_ok($$ select api.audit_auth_event('auth.login', 'a1a1a1a1-0000-4000-8000-0000000000a1', '{"method":"password","aal":"aal1"}') $$, 'login grava');
reset role;
select is((select actor::text || '|' || tenant_id || '|' || app_role || '|' || (details ->> 'method') from audit.event where action = 'auth.login' order by seq desc limit 1),
  'a1a1a1a1-0000-4000-8000-0000000000a1|aaaaaaaa-0000-4000-8000-000000000001|ADMIN|password', 'ator, clínica e papel vêm do vínculo, não do chamador');

set local role service_role;
select lives_ok($$ select api.audit_auth_event('auth.login_failed', null, '{"reason":"invalid_credentials"}') $$, 'falha de login grava sem identificar a conta');
reset role;
select is((select coalesce(actor::text, 'sem-ator') || '|' || coalesce(tenant_id::text, 'sem-clinica') || '|' || app_role from audit.event where action = 'auth.login_failed' order by seq desc limit 1),
  'sem-ator|sem-clinica|system', 'falha: sem ator e sem clínica');

set local role service_role;
select lives_ok($$ select api.audit_auth_event('auth.logout', 'f5f5f5f5-0000-4000-8000-0000000000f5') $$, 'pessoa sem clínica: grava sem clínica');
select throws_ok($$ select api.audit_auth_event('auth.qualquer', 'a1a1a1a1-0000-4000-8000-0000000000a1') $$, 'P0001', 'ATTA-IN-0001', 'ação fora da lista é recusada');
select throws_ok($$ select api.audit_auth_event('auth.login', 'a1a1a1a1-0000-4000-8000-0000000000a1', '{"email":"x@exemplo.test"}') $$, 'P0001', 'ATTA-IN-0001', 'chave fora de method/aal/reason é recusada');
select throws_ok($$ select api.audit_auth_event('auth.login', 'a1a1a1a1-0000-4000-8000-0000000000a1', jsonb_build_object('reason', repeat('x', 41))) $$, 'P0001', 'ATTA-IN-0001', 'texto longo é recusado');
select throws_ok($$ select api.audit_auth_event('auth.login_failed', 'a1a1a1a1-0000-4000-8000-0000000000a1') $$, 'P0001', 'ATTA-IN-0001', 'falha de login com conta é recusada');
select throws_ok($$ select api.audit_auth_event('auth.login', null) $$, 'P0001', 'ATTA-IN-0001', 'login sem conta é recusado');
select throws_ok($$ select api.audit_auth_event('auth.login', gen_random_uuid(), '{"method":"password"}') $$, 'P0001', 'ATTA-IN-0001', 'usuário que não existe não vira autor');
reset role;

select is(audit.verify_chain(), null, 'a cadeia segue íntegra');
select * from finish();
rollback;
