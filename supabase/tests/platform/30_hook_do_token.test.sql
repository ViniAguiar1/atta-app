-- O Custom Access Token Hook (MIG-03; ADR 0001 §2): claims tenant_id e app_role a partir do vínculo ativo, claim role
-- intacto, falha fechada sem vínculo e grants só para o Supabase Auth. Só dados fictícios.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email, aud, role) values
  ('11111111-0000-4000-8000-000000000011', 'uma@exemplo.test', 'authenticated', 'authenticated'),
  ('22222222-0000-4000-8000-000000000022', 'doisab@exemplo.test', 'authenticated', 'authenticated'),
  ('33333333-0000-4000-8000-000000000033', 'semvinculo@exemplo.test', 'authenticated', 'authenticated'),
  ('44444444-0000-4000-8000-000000000044', 'suspenso@exemplo.test', 'authenticated', 'authenticated'),
  ('55555555-0000-4000-8000-000000000055', 'clinicaapagada@exemplo.test', 'authenticated', 'authenticated');
insert into platform.tenant (id, name, deleted_at) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Clínica Alfa Ficticia', null),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Clínica Beta Ficticia', null),
  ('cccccccc-0000-4000-8000-000000000003', 'Clínica Gama Ficticia', now());
insert into platform.membership (tenant_id, user_id, app_role, status, created_at) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000011', 'COLABORADOR', 'active', now()),
  ('aaaaaaaa-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000022', 'ADMIN', 'active', now() - interval '2 days'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000022', 'COLABORADOR', 'active', now() - interval '1 day'),
  ('aaaaaaaa-0000-4000-8000-000000000001', '44444444-0000-4000-8000-000000000044', 'ADMIN', 'suspended', now()),
  ('cccccccc-0000-4000-8000-000000000003', '55555555-0000-4000-8000-000000000055', 'ADMIN', 'active', now());

select is((private.custom_access_token_hook('{"user_id":"11111111-0000-4000-8000-000000000011","claims":{"sub":"11111111-0000-4000-8000-000000000011","role":"authenticated","aud":"authenticated"}}'::jsonb) -> 'claims' ->> 'tenant_id'), 'aaaaaaaa-0000-4000-8000-000000000001', 'vínculo ativo: o token ganha a clínica');
select is((private.custom_access_token_hook('{"user_id":"11111111-0000-4000-8000-000000000011","claims":{"sub":"11111111-0000-4000-8000-000000000011","role":"authenticated","aud":"authenticated"}}'::jsonb) -> 'claims' ->> 'app_role'), 'COLABORADOR', 'e o papel do banco');
select is((private.custom_access_token_hook('{"user_id":"11111111-0000-4000-8000-000000000011","claims":{"sub":"11111111-0000-4000-8000-000000000011","role":"authenticated","aud":"authenticated"}}'::jsonb) -> 'claims' ->> 'role'), 'authenticated', 'o claim role fica intacto');
select is((private.custom_access_token_hook('{"user_id":"11111111-0000-4000-8000-000000000011","claims":{"sub":"11111111-0000-4000-8000-000000000011","role":"authenticated","aud":"authenticated"}}'::jsonb) -> 'claims' ->> 'sub'), '11111111-0000-4000-8000-000000000011', 'os outros claims ficam intactos');
select is((private.custom_access_token_hook('{"user_id":"22222222-0000-4000-8000-000000000022","claims":{"sub":"22222222-0000-4000-8000-000000000022","role":"authenticated","aud":"authenticated"}}'::jsonb) -> 'claims' ->> 'tenant_id'), 'aaaaaaaa-0000-4000-8000-000000000001', 'dois vínculos: vale o mais antigo (A)');
select is((private.custom_access_token_hook('{"user_id":"22222222-0000-4000-8000-000000000022","claims":{"sub":"22222222-0000-4000-8000-000000000022","role":"authenticated","aud":"authenticated"}}'::jsonb) -> 'claims' ->> 'app_role'), 'ADMIN', 'com o papel daquele vínculo');
select ok(not (private.custom_access_token_hook('{"user_id":"33333333-0000-4000-8000-000000000033","claims":{"sub":"33333333-0000-4000-8000-000000000033","role":"authenticated","aud":"authenticated","tenant_id":"bbbbbbbb-0000-4000-8000-000000000002","app_role":"ADMIN"}}'::jsonb) -> 'claims' ? 'tenant_id'), 'sem vínculo: tira o tenant_id que veio no evento');
select ok(not (private.custom_access_token_hook('{"user_id":"33333333-0000-4000-8000-000000000033","claims":{"sub":"33333333-0000-4000-8000-000000000033","role":"authenticated","aud":"authenticated","tenant_id":"bbbbbbbb-0000-4000-8000-000000000002","app_role":"ADMIN"}}'::jsonb) -> 'claims' ? 'app_role'), 'sem vínculo: tira o app_role que veio no evento');
select ok(not (private.custom_access_token_hook('{"user_id":"44444444-0000-4000-8000-000000000044","claims":{"sub":"44444444-0000-4000-8000-000000000044","role":"authenticated","aud":"authenticated"}}'::jsonb) -> 'claims' ? 'tenant_id'), 'vínculo suspenso: sem clínica no token');
select ok(not (private.custom_access_token_hook('{"user_id":"55555555-0000-4000-8000-000000000055","claims":{"sub":"55555555-0000-4000-8000-000000000055","role":"authenticated","aud":"authenticated"}}'::jsonb) -> 'claims' ? 'tenant_id'), 'clínica apagada (deleted_at): sem clínica no token');
select ok(not (private.custom_access_token_hook('{"user_id":"nao-e-uuid","claims":{"role":"authenticated","tenant_id":"aaaaaaaa-0000-4000-8000-000000000001"}}'::jsonb) -> 'claims' ? 'tenant_id'), 'user_id inválido: sem clínica, sem erro');
select ok(has_function_privilege('supabase_auth_admin', 'private.custom_access_token_hook(jsonb)', 'EXECUTE'), 'o Supabase Auth executa o hook');
select ok(has_schema_privilege('supabase_auth_admin', 'private', 'USAGE'), 'o Supabase Auth usa o schema private');
select ok(not has_function_privilege('authenticated', 'private.custom_access_token_hook(jsonb)', 'EXECUTE'), 'authenticated não chama o hook');
select ok(not has_function_privilege('anon', 'private.custom_access_token_hook(jsonb)', 'EXECUTE'), 'anon não chama o hook');
select ok(not has_function_privilege('service_role', 'private.custom_access_token_hook(jsonb)', 'EXECUTE'), 'service_role não chama o hook');


select * from finish();
rollback;
