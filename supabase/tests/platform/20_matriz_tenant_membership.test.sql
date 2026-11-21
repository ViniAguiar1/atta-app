-- Matriz papel × tabela × operação de platform.tenant e platform.membership (MIG-02; ADR 0001 §2). As policies rodam
-- como authenticated com claims simulados: provam que avaliam (sem "permission denied for schema private"), que uma
-- clínica não vê a outra, que o papel que vale é o do banco, que vínculo removido ou suspenso perde o acesso na hora
-- (inclusive à clínica) e que ninguém escreve vínculo direto pela tabela (convite e papel: funções do MIG-06).
-- Só dados fictícios.
begin;
create extension if not exists pgtap with schema extensions;
-- a migration base tira o EXECUTE de public das funções novas; aqui, só nesta transação, o pgTAP volta a ser chamável
grant execute on all functions in schema extensions to authenticated, anon;
select plan(34);

-- hora do login no token (MIG-03: sessão de no máximo 12 h; sem amr, has_permission nega)
create function pg_temp.com_login(c text) returns text language sql as $$
  select (c::jsonb || jsonb_build_object('amr', jsonb_build_array(jsonb_build_object('method', 'password',
    'timestamp', extract(epoch from now())::bigint))))::text
$$;
grant execute on function pg_temp.com_login(text) to authenticated;

insert into auth.users (id, email, aud, role) values
  ('a1a1a1a1-0000-4000-8000-0000000000a1', 'admina@exemplo.test', 'authenticated', 'authenticated'),
  ('c1c1c1c1-0000-4000-8000-0000000000c1', 'colaba@exemplo.test', 'authenticated', 'authenticated'),
  ('b2b2b2b2-0000-4000-8000-0000000000b2', 'adminb@exemplo.test', 'authenticated', 'authenticated'),
  ('d3d3d3d3-0000-4000-8000-0000000000d3', 'removidoa@exemplo.test', 'authenticated', 'authenticated'),
  ('e4e4e4e4-0000-4000-8000-0000000000e4', 'suspensoa@exemplo.test', 'authenticated', 'authenticated'),
  ('f5f5f5f5-0000-4000-8000-0000000000f5', 'convidadoa@exemplo.test', 'authenticated', 'authenticated');
insert into platform.tenant (id, name, cnpj) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Clínica Alfa Ficticia', '11222333000181'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Clínica Beta Ficticia', '22333444000181');
insert into platform.membership (tenant_id, user_id, app_role, status, deleted_at) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-0000000000a1', 'ADMIN', 'active', null),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-0000000000c1', 'COLABORADOR', 'active', null),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b2b2b2b2-0000-4000-8000-0000000000b2', 'ADMIN', 'active', null),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'd3d3d3d3-0000-4000-8000-0000000000d3', 'ADMIN', 'active', now()),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'e4e4e4e4-0000-4000-8000-0000000000e4', 'ADMIN', 'suspended', null);

set local role authenticated;
select set_config('request.jwt.claims', pg_temp.com_login('{"sub":"a1a1a1a1-0000-4000-8000-0000000000a1","role":"authenticated","tenant_id":"aaaaaaaa-0000-4000-8000-000000000001","app_role":"ADMIN","aal":"aal2"}'), true);

select is((select count(*)::int from platform.tenant), 1, 'ADMIN vê só a própria clínica');

select is((select id from platform.tenant), 'aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'ADMIN vê a clínica A, nunca a B');

select throws_ok($$ update platform.tenant set name = 'Clínica Alfa Renomeada' where id = 'aaaaaaaa-0000-4000-8000-000000000001' $$, '42501', null, 'ADMIN não renomeia direto pela tabela (só pelo api.clinic_profile_set, com trilha; MIG-42)');

select throws_ok($$ update platform.tenant set name = 'Invasão' where id = 'bbbbbbbb-0000-4000-8000-000000000002' $$, '42501', null, 'nem na clínica B: sem update direto em platform.tenant');

select throws_ok($$ insert into platform.tenant (name) values ('Nova') $$, '42501', null, 'ninguém cria clínica direto pela tabela');

select throws_ok($$ delete from platform.tenant where id = 'aaaaaaaa-0000-4000-8000-000000000001' $$, '42501', null, 'ninguém apaga clínica');

select is((select count(*)::int from platform.membership), 3, 'ADMIN vê a equipe viva da clínica (o suspenso aparece; o removido, não)');

select throws_ok($$ insert into platform.membership (tenant_id, user_id, app_role) values ('aaaaaaaa-0000-4000-8000-000000000001', 'f5f5f5f5-0000-4000-8000-0000000000f5', 'COLABORADOR') $$, '42501', null, 'ADMIN não escreve vínculo direto pela tabela: convite é função do MIG-06');

select throws_ok($$ insert into platform.membership (tenant_id, user_id, app_role) values ('bbbbbbbb-0000-4000-8000-000000000002', 'c1c1c1c1-0000-4000-8000-0000000000c1', 'ADMIN') $$, '42501', null, 'ADMIN não cria vínculo em outra clínica');

select throws_ok($$ update platform.membership set app_role = 'ADMIN' where user_id = 'c1c1c1c1-0000-4000-8000-0000000000c1' and tenant_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$, '42501', null, 'ADMIN não troca papel direto pela tabela (limite de 2 ADMIN: MIG-06)');

select throws_ok($$ delete from platform.membership $$, '42501', null, 'vínculo não se apaga (exclusão é lógica)');

select throws_ok($$ update platform.membership set status = 'suspended' $$, '42501', null, 'ADMIN não suspende nem remove direto pela tabela');

reset role;
select set_config('request.jwt.claims', '', true);

select is((select name from platform.tenant where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'Clínica Alfa Ficticia', 'o nome da clínica A não mudou pelo UPDATE direto');

select is((select name from platform.tenant where id = 'bbbbbbbb-0000-4000-8000-000000000002'), 'Clínica Beta Ficticia', 'a clínica B ficou intacta');

select is((select app_role from platform.membership where user_id = 'c1c1c1c1-0000-4000-8000-0000000000c1' and tenant_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'COLABORADOR', 'o papel não mudou');


set local role authenticated;
select set_config('request.jwt.claims', pg_temp.com_login('{"sub":"c1c1c1c1-0000-4000-8000-0000000000c1","role":"authenticated","tenant_id":"aaaaaaaa-0000-4000-8000-000000000001","app_role":"COLABORADOR","aal":"aal1"}'), true);

select is((select count(*)::int from platform.tenant), 1, 'COLABORADOR vê a própria clínica');

select is((select count(*)::int from platform.membership), 1, 'COLABORADOR vê só o próprio vínculo (equipe é do ADMIN)');

select throws_ok($$ update platform.tenant set name = 'Tentativa' where id = 'aaaaaaaa-0000-4000-8000-000000000001' $$, '42501', null, 'COLABORADOR não escreve na clínica');

select throws_ok($$ insert into platform.membership (tenant_id, user_id, app_role) values ('aaaaaaaa-0000-4000-8000-000000000001', 'f5f5f5f5-0000-4000-8000-0000000000f5', 'ADMIN') $$, '42501', null, 'COLABORADOR não convida');

reset role;
select set_config('request.jwt.claims', '', true);

select is((select name from platform.tenant where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'Clínica Alfa Ficticia', 'o COLABORADOR não renomeou a clínica');

set local role authenticated;
select set_config('request.jwt.claims', pg_temp.com_login('{"sub":"c1c1c1c1-0000-4000-8000-0000000000c1","role":"authenticated","tenant_id":"aaaaaaaa-0000-4000-8000-000000000001","app_role":"ADMIN","aal":"aal2"}'), true);

select is((select count(*)::int from platform.membership), 1, 'token com app_role ADMIN não vale: o papel é o do banco');

reset role;
select set_config('request.jwt.claims', '', true);

set local role authenticated;
select set_config('request.jwt.claims', pg_temp.com_login('{"sub":"b2b2b2b2-0000-4000-8000-0000000000b2","role":"authenticated","tenant_id":"bbbbbbbb-0000-4000-8000-000000000002","app_role":"ADMIN","aal":"aal2"}'), true);

select is((select id from platform.tenant), 'bbbbbbbb-0000-4000-8000-000000000002'::uuid, 'ADMIN da B vê só a B');

select is((select count(*)::int from platform.membership where tenant_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 0, 'ADMIN da B não vê a equipe da A');

reset role;
select set_config('request.jwt.claims', '', true);

set local role authenticated;
select set_config('request.jwt.claims', pg_temp.com_login('{"sub":"b2b2b2b2-0000-4000-8000-0000000000b2","role":"authenticated","tenant_id":"aaaaaaaa-0000-4000-8000-000000000001","app_role":"ADMIN","aal":"aal2"}'), true);

select is((select count(*)::int from platform.membership), 0, 'token com a clínica A para quem não é membro dela: nada da equipe');

reset role;
select set_config('request.jwt.claims', '', true);

set local role authenticated;
select set_config('request.jwt.claims', pg_temp.com_login('{"sub":"d3d3d3d3-0000-4000-8000-0000000000d3","role":"authenticated","tenant_id":"aaaaaaaa-0000-4000-8000-000000000001","app_role":"ADMIN","aal":"aal2"}'), true);

select is((select count(*)::int from platform.membership), 0, 'vínculo removido: o token ainda válido não vê a equipe');
select is((select count(*)::int from platform.tenant), 0, 'vínculo removido: o token ainda válido não vê nem a clínica');

select throws_ok($$ insert into platform.membership (tenant_id, user_id, app_role) values ('aaaaaaaa-0000-4000-8000-000000000001', 'f5f5f5f5-0000-4000-8000-0000000000f5', 'ADMIN') $$, '42501', null, 'vínculo removido não convida');

reset role;
select set_config('request.jwt.claims', '', true);

set local role authenticated;
select set_config('request.jwt.claims', pg_temp.com_login('{"sub":"e4e4e4e4-0000-4000-8000-0000000000e4","role":"authenticated","tenant_id":"aaaaaaaa-0000-4000-8000-000000000001","app_role":"ADMIN","aal":"aal2"}'), true);

select is((select count(*)::int from platform.membership), 0, 'vínculo suspenso: nenhum vínculo, nem o próprio');
select is((select count(*)::int from platform.tenant), 0, 'vínculo suspenso: nem a clínica');

reset role;
select set_config('request.jwt.claims', '', true);

set local role authenticated;
select set_config('request.jwt.claims', pg_temp.com_login('{"sub":"a1a1a1a1-0000-4000-8000-0000000000a1","role":"authenticated"}'), true);

select is((select count(*)::int from platform.tenant), 0, 'sem claim de clínica: nenhuma linha (falha fechada)');

select is((select count(*)::int from platform.membership), 0, 'sem claim de clínica: nenhum vínculo');

reset role;
select set_config('request.jwt.claims', '', true);

set local role authenticated;
select set_config('request.jwt.claims', pg_temp.com_login('{"sub":"a1a1a1a1-0000-4000-8000-0000000000a1","role":"authenticated","tenant_id":"nao-e-uuid","app_role":"ADMIN","aal":"aal2"}'), true);

select is((select count(*)::int from platform.tenant), 0, 'claim de clínica que não é uuid: nenhuma linha');

reset role;
select set_config('request.jwt.claims', '', true);

set local role anon;

select throws_ok($$ select * from platform.tenant $$, '42501', null, 'anon não lê clínica');

select throws_ok($$ select * from platform.membership $$, '42501', null, 'anon não lê vínculo');

reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
