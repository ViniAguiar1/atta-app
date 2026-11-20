-- MIG-06 · Equipe & Permissões (PDD v206 §10.4.3): convite (COLABORADOR invited com o padrão ou a matriz; ADMIN
-- gestor adicional pending_verification), aceite, Editar acesso, Suspender/Reativar, Excluir, titular protegido,
-- no máximo 2 ADMIN garantido no banco, auditoria de cada mudança e isolamento entre clínicas. Só dados fictícios.
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated;
select plan(52);

create function pg_temp.como(p_sub uuid, p_role text, p_aal text default 'aal2',
                             p_tenant uuid default 'aaaaaaaa-0000-4000-8000-000000000001') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_strip_nulls(jsonb_build_object('sub', p_sub, 'role', 'authenticated',
    'tenant_id', p_tenant, 'app_role', p_role, 'aal', p_aal,
    'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint))
  ))::text, true);
end $$;
grant execute on function pg_temp.como(uuid, text, text, uuid) to authenticated;
create function pg_temp.status(p_id uuid) returns text language sql security definer as $$
  select status || case when deleted_at is null then '' else ':removido' end from platform.membership where id = p_id
$$;
grant execute on function pg_temp.status(uuid) to authenticated;
create function pg_temp.eventos(p_action text) returns int language sql security definer as $$
  select count(*)::int from audit.event where action = p_action
$$;
grant execute on function pg_temp.eventos(text) to authenticated;
create function pg_temp.vinculo(p_user uuid) returns uuid language sql security definer as $$
  select id from platform.membership where user_id = p_user and deleted_at is null
$$;
grant execute on function pg_temp.vinculo(uuid) to authenticated;
create function pg_temp.matriz(p_id uuid) returns jsonb language sql security definer as $$
  select private.team_permissions_of(p_id)
$$;
grant execute on function pg_temp.matriz(uuid) to authenticated;

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('a1a1a1a1-0000-4000-8000-0000000000a1', 'titular@exemplo.test', 'authenticated', 'authenticated', '{"full_name":"Titular Ficticia"}'),
  ('c1c1c1c1-0000-4000-8000-0000000000c1', 'recepcao1@exemplo.test', 'authenticated', 'authenticated', '{}'),
  ('c2c2c2c2-0000-4000-8000-0000000000c2', 'recepcao2@exemplo.test', 'authenticated', 'authenticated', '{}'),
  ('01010101-0000-4000-8000-000000000001', 'novo1@exemplo.test', 'authenticated', 'authenticated', '{}'),
  ('02020202-0000-4000-8000-000000000002', 'novo2@exemplo.test', 'authenticated', 'authenticated', '{}'),
  ('03030303-0000-4000-8000-000000000003', 'gestor3@exemplo.test', 'authenticated', 'authenticated', '{}'),
  ('04040404-0000-4000-8000-000000000004', 'gestor4@exemplo.test', 'authenticated', 'authenticated', '{}'),
  ('05050505-0000-4000-8000-000000000005', 'gestor5@exemplo.test', 'authenticated', 'authenticated', '{}'),
  ('b1b1b1b1-0000-4000-8000-0000000000b1', 'titularbeta@exemplo.test', 'authenticated', 'authenticated', '{}'),
  ('b2b2b2b2-0000-4000-8000-0000000000b2', 'recepcaobeta@exemplo.test', 'authenticated', 'authenticated', '{}');
-- os recém-convidados (o inviteUserByEmail grava invited_at); b2 foi convidado e já entra no sistema
update auth.users set invited_at = now() where email in ('novo1@exemplo.test', 'novo2@exemplo.test',
  'gestor3@exemplo.test', 'gestor4@exemplo.test', 'gestor5@exemplo.test', 'recepcaobeta@exemplo.test');
update auth.users set last_sign_in_at = now() where email = 'recepcaobeta@exemplo.test';
insert into platform.tenant (id, name) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Clínica Alfa Ficticia'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Clínica Beta Ficticia');
insert into platform.membership (id, tenant_id, user_id, app_role, is_owner) values
  ('11111111-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-0000000000a1', 'ADMIN', true),
  ('11111111-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-0000000000c1', 'COLABORADOR', false),
  ('11111111-0000-4000-8000-0000000000c2', 'aaaaaaaa-0000-4000-8000-000000000001', 'c2c2c2c2-0000-4000-8000-0000000000c2', 'COLABORADOR', false),
  ('11111111-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-000000000002', 'b1b1b1b1-0000-4000-8000-0000000000b1', 'ADMIN', true),
  ('11111111-0000-4000-8000-0000000000b2', 'bbbbbbbb-0000-4000-8000-000000000002', 'b2b2b2b2-0000-4000-8000-0000000000b2', 'COLABORADOR', false);

set local role authenticated;

-- 1. Lista da equipe: só ADMIN, auditada, sem a matriz do ADMIN
select pg_temp.como('c1c1c1c1-0000-4000-8000-0000000000c1', 'COLABORADOR', 'aal1');
select throws_ok($$ select * from api.team_list() $$, '42501', 'ATTA-AUTH-0004', 'COLABORADOR não lista a equipe');
select pg_temp.como('a1a1a1a1-0000-4000-8000-0000000000a1', 'ADMIN', 'aal1');
select throws_ok($$ select * from api.team_list() $$, '42501', 'ATTA-AUTH-0004', 'ADMIN sem o 2º fator não lista a equipe');
select pg_temp.como('a1a1a1a1-0000-4000-8000-0000000000a1', 'ADMIN');
select is((select count(*)::int from api.team_list()), 3, 'ADMIN lista a própria equipe (nunca a da clínica B)');
select is((select display_name from api.team_list() where is_owner), 'Titular Ficticia', 'a lista traz o nome e marca o titular');
select is((select permissions from api.team_list() where is_owner), null, 'ADMIN não tem matriz na lista');
select is((select permissions -> 'atta' from api.team_list() where email = 'recepcao1@exemplo.test'), '["view"]'::jsonb,
  'COLABORADOR aparece com a matriz');
select ok(pg_temp.eventos('team.list') >= 1, 'listar a equipe fica no log de acesso');

-- 2. Convite
select lives_ok($$ select api.team_invite('01010101-0000-4000-8000-000000000001', 'COLABORADOR') $$, 'ADMIN convida COLABORADOR');
select is(pg_temp.status(pg_temp.vinculo('01010101-0000-4000-8000-000000000001')), 'invited', 'convidado fica Pendente (invited)');
select is(pg_temp.matriz(pg_temp.vinculo('01010101-0000-4000-8000-000000000001')),
  '{"appointments":["create","edit","view"],"atta":["view"],"patients":["create","edit","view"]}'::jsonb,
  'sem matriz, vale o padrão sugerido do §10.4.3');
select lives_ok($$ select api.team_invite('02020202-0000-4000-8000-000000000002', 'COLABORADOR', '{"documents":["view"]}') $$,
  'ADMIN convida COLABORADOR com matriz própria');
select is(pg_temp.matriz(pg_temp.vinculo('02020202-0000-4000-8000-000000000002')), '{"documents":["view"]}'::jsonb,
  'a matriz informada substitui o padrão');
select throws_ok($$ select api.team_invite('02020202-0000-4000-8000-000000000002', 'COLABORADOR') $$, '23505', 'ATTA-IN-0002',
  'a mesma pessoa não é convidada duas vezes');
select throws_ok($$ select api.team_invite('03030303-0000-4000-8000-000000000003', 'PROFISSIONAL') $$, 'P0001', 'ATTA-IN-0001',
  'papel fora da lista é recusado (o profissional não tem login)');
select throws_ok($$ select api.team_invite('03030303-0000-4000-8000-000000000003', 'ADMIN', '{"documents":["view"]}') $$,
  'P0001', 'ATTA-IN-0001', 'ADMIN não recebe matriz');
select throws_ok($$ select api.team_invite('09090909-0000-4000-8000-000000000009', 'COLABORADOR') $$, 'P0002', 'ATTA-CORE-0005',
  'usuário inexistente é recusado');
select throws_ok($$ select api.team_invite('b1b1b1b1-0000-4000-8000-0000000000b1', 'COLABORADOR') $$, 'P0001', 'ATTA-IN-0003',
  'conta que não veio de convite não ganha vínculo (sugestão da Segurança)');
select throws_ok($$ select api.team_invite('b2b2b2b2-0000-4000-8000-0000000000b2', 'COLABORADOR') $$, 'P0001', 'ATTA-IN-0003',
  'conta que já entrou no sistema (de outra clínica) não ganha segundo vínculo');
select lives_ok($$ select api.team_invite('03030303-0000-4000-8000-000000000003', 'ADMIN') $$, 'ADMIN convida o gestor adicional');
select is(pg_temp.status(pg_temp.vinculo('03030303-0000-4000-8000-000000000003')), 'pending_verification',
  'gestor adicional fica Pendente até a conferência pela ATTA');
select throws_ok($$ select api.team_invite('04040404-0000-4000-8000-000000000004', 'ADMIN') $$, 'P0001', 'ATTA-IN-0003',
  'terceiro ADMIN é recusado: no máximo 2 gestores');
select is(pg_temp.eventos('team.invite'), 3, 'cada convite fica na trilha');

-- 3. Aceite do convite pelo próprio convidado (token ainda sem clínica)
select pg_temp.como('01010101-0000-4000-8000-000000000001', null, 'aal1', null);
select lives_ok(format('select api.team_accept_invite(%L)', pg_temp.vinculo('01010101-0000-4000-8000-000000000001')),
  'o convidado aceita o próprio convite');
select is(pg_temp.status(pg_temp.vinculo('01010101-0000-4000-8000-000000000001')), 'active', 'aceito, o vínculo fica Ativo');
select throws_ok(format('select api.team_accept_invite(%L)', pg_temp.vinculo('02020202-0000-4000-8000-000000000002')),
  'P0002', 'ATTA-CORE-0005', 'ninguém aceita o convite de outra pessoa');
-- dois convites ao mesmo tempo: aceito o da A, o token já tem a clínica A; o da B é recusado com conflito claro
select pg_temp.como('b1b1b1b1-0000-4000-8000-0000000000b1', 'ADMIN', 'aal2', 'bbbbbbbb-0000-4000-8000-000000000002');
select set_config('atta_teste.convite_b', api.team_invite('01010101-0000-4000-8000-000000000001', 'COLABORADOR')::text, true);
select pg_temp.como('01010101-0000-4000-8000-000000000001', 'COLABORADOR', 'aal1');
select throws_ok(format('select api.team_accept_invite(%L)', current_setting('atta_teste.convite_b')),
  'P0001', 'ATTA-IN-0003', 'aceite com o token de outra clínica é recusado (sem troca de clínica ativa)');
select pg_temp.como('03030303-0000-4000-8000-000000000003', null, 'aal1', null);
select throws_ok(format('select api.team_accept_invite(%L)', pg_temp.vinculo('03030303-0000-4000-8000-000000000003')),
  'P0001', 'ATTA-IN-0003', 'o gestor adicional não se ativa sozinho: só a ATTA aprova');

-- 4. Editar acesso
select pg_temp.como('a1a1a1a1-0000-4000-8000-0000000000a1', 'ADMIN');
select lives_ok($$ select api.team_set_permissions('11111111-0000-4000-8000-0000000000c1', '{"patients":["view"],"metrics":["view"]}') $$,
  'ADMIN edita a matriz do COLABORADOR');
select is(pg_temp.matriz('11111111-0000-4000-8000-0000000000c1'), '{"metrics":["view"],"patients":["view"]}'::jsonb,
  'a matriz nova substitui a anterior inteira');
select is(pg_temp.eventos('team.set_permissions'), 1, 'cada alteração de acesso fica na trilha');
select throws_ok($$ select api.team_set_permissions('11111111-0000-4000-8000-0000000000c1', '{"atta":["create"]}') $$,
  '23514', null, 'ATTA só tem visualizar');
select throws_ok($$ select api.team_set_permissions('11111111-0000-4000-8000-0000000000c1', '{"documents":["create"]}') $$,
  '23514', null, 'criar sem visualizar é recusado');
select throws_ok($$ select api.team_set_permissions('11111111-0000-4000-8000-0000000000c1', '["view"]') $$,
  'P0001', 'ATTA-IN-0001', 'matriz fora do formato é recusada');
select throws_ok($$ select api.team_set_permissions('11111111-0000-4000-8000-0000000000a1', '{}') $$,
  'P0001', 'ATTA-IN-0003', 'ADMIN não tem matriz para editar');
select throws_ok($$ select api.team_set_permissions('11111111-0000-4000-8000-0000000000b2', '{}') $$,
  'P0002', 'ATTA-CORE-0005', 'vínculo de outra clínica: não encontrado');
select pg_temp.como('c1c1c1c1-0000-4000-8000-0000000000c1', 'COLABORADOR', 'aal1');
select throws_ok($$ select api.team_set_permissions('11111111-0000-4000-8000-0000000000c1', '{"documents":["view"]}') $$,
  '42501', 'ATTA-AUTH-0004', 'COLABORADOR não muda a própria matriz');

-- 5. Suspender e reativar
select pg_temp.como('a1a1a1a1-0000-4000-8000-0000000000a1', 'ADMIN');
select lives_ok($$ select api.team_suspend('11111111-0000-4000-8000-0000000000c2') $$, 'ADMIN suspende COLABORADOR');
select throws_ok($$ select api.team_suspend('11111111-0000-4000-8000-0000000000c2') $$, 'P0001', 'ATTA-IN-0003',
  'suspender quem já está suspenso é recusado');
select throws_ok($$ select api.team_suspend('11111111-0000-4000-8000-0000000000a1') $$, 'P0001', 'ATTA-IN-0003',
  'ninguém suspende a si mesmo');
select lives_ok($$ select api.team_reactivate('11111111-0000-4000-8000-0000000000c2') $$, 'ADMIN reativa');
select is(pg_temp.status('11111111-0000-4000-8000-0000000000c2'), 'active', 'reativado volta a Ativo');

-- 6. Excluir e titular protegido
select lives_ok(format('select api.team_remove(%L)', pg_temp.vinculo('03030303-0000-4000-8000-000000000003')),
  'cancelar o convite de um gestor adicional ainda pendente é permitido');
select lives_ok($$ select api.team_invite('04040404-0000-4000-8000-000000000004', 'ADMIN') $$,
  'com o pendente cancelado, cabe outro gestor adicional');
reset role;
update platform.membership set status = 'active' where user_id = '04040404-0000-4000-8000-000000000004'; -- aprovado pela ATTA (PR C)
set local role authenticated;
select pg_temp.como('04040404-0000-4000-8000-000000000004', 'ADMIN');
select throws_ok($$ select api.team_suspend('11111111-0000-4000-8000-0000000000a1') $$, 'P0001', 'ATTA-IN-0003',
  'o gestor adicional não suspende o titular');
select throws_ok($$ select api.team_remove('11111111-0000-4000-8000-0000000000a1') $$, 'P0001', 'ATTA-IN-0003',
  'Excluir é bloqueado para o titular');
select pg_temp.como('a1a1a1a1-0000-4000-8000-0000000000a1', 'ADMIN');
select throws_ok(format('select api.team_remove(%L)', pg_temp.vinculo('04040404-0000-4000-8000-000000000004')),
  'P0001', 'ATTA-IN-0003', 'excluir outro gestor é ação protegida (só pela ATTA, com nova conferência)');
select lives_ok($$ select api.team_remove('11111111-0000-4000-8000-0000000000c2') $$, 'ADMIN exclui COLABORADOR');
select is(pg_temp.status('11111111-0000-4000-8000-0000000000c2'), 'active:removido', 'exclusão é lógica (deleted_at)');
reset role;

-- 7. A guarda vale fora das funções também
select throws_ok($$ insert into platform.membership (tenant_id, user_id, app_role)
  values ('aaaaaaaa-0000-4000-8000-000000000001', '05050505-0000-4000-8000-000000000005', 'ADMIN') $$,
  'P0001', 'ATTA-IN-0003', 'nem direto no banco passa um terceiro ADMIN');
select throws_ok($$ update platform.membership set status = 'suspended' where id = '11111111-0000-4000-8000-0000000000a1' $$,
  'P0001', 'ATTA-IN-0003', 'nem direto no banco o titular é suspenso');
select throws_ok($$ update platform.membership set is_owner = true where user_id = '04040404-0000-4000-8000-000000000004' $$,
  '23505', null, 'uma clínica tem um titular só');
select is(has_function_privilege('anon', 'api.team_invite(uuid, text, jsonb)', 'EXECUTE'), false, 'anon não executa as funções de equipe');

select * from finish();
rollback;
