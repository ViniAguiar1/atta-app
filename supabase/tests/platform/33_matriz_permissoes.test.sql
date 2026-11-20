-- MIG-06 · matriz de permissões por módulo do COLABORADOR (PDD v206 §10.4.3; ADR 0001 §2). Prova: o padrão sugerido ao
-- convidar, a presença da linha como permissão, "criar e editar exigem visualizar", os pares proibidos (atta e metrics
-- só view; settings, team e audit nunca), o corte imediato ao tirar a linha, o isolamento entre clínicas e que ninguém
-- escreve a matriz pela tabela. Só dados fictícios.
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated;
select plan(39);

-- hora do login no token (MIG-03: sessão de no máximo 12 h; sem amr, has_permission nega)
create function pg_temp.com_login(c text) returns text language sql as $$
  select (c::jsonb || jsonb_build_object('amr', jsonb_build_array(jsonb_build_object('method', 'password',
    'timestamp', extract(epoch from now())::bigint))))::text
$$;
grant execute on function pg_temp.com_login(text) to authenticated;
-- entra como o usuário na clínica A, com o papel e o aal dados
create function pg_temp.como(p_sub text, p_role text, p_aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims', pg_temp.com_login(jsonb_build_object('sub', p_sub, 'role', 'authenticated',
    'tenant_id', 'aaaaaaaa-0000-4000-8000-000000000001', 'app_role', p_role, 'aal', p_aal)::text), true)::text;
  select null::void;
$$;
grant execute on function pg_temp.como(text, text, text) to authenticated;

insert into auth.users (id, email, aud, role) values
  ('a1a1a1a1-0000-4000-8000-0000000000a1', 'adminmatriz@exemplo.test', 'authenticated', 'authenticated'),
  ('c1c1c1c1-0000-4000-8000-0000000000c1', 'colabmatriz@exemplo.test', 'authenticated', 'authenticated'),
  ('c2c2c2c2-0000-4000-8000-0000000000c2', 'colabmatriz2@exemplo.test', 'authenticated', 'authenticated'),
  ('b2b2b2b2-0000-4000-8000-0000000000b2', 'colabbeta@exemplo.test', 'authenticated', 'authenticated'),
  ('e4e4e4e4-0000-4000-8000-0000000000e4', 'colabsuspenso@exemplo.test', 'authenticated', 'authenticated');
insert into platform.tenant (id, name) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Clínica Alfa Ficticia'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Clínica Beta Ficticia');
insert into platform.membership (id, tenant_id, user_id, app_role, status) values
  ('11111111-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-0000000000a1', 'ADMIN', 'active'),
  ('11111111-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-0000000000c1', 'COLABORADOR', 'active'),
  ('11111111-0000-4000-8000-0000000000c2', 'aaaaaaaa-0000-4000-8000-000000000001', 'c2c2c2c2-0000-4000-8000-0000000000c2', 'COLABORADOR', 'active'),
  ('11111111-0000-4000-8000-0000000000b2', 'bbbbbbbb-0000-4000-8000-000000000002', 'b2b2b2b2-0000-4000-8000-0000000000b2', 'COLABORADOR', 'active'),
  ('11111111-0000-4000-8000-0000000000e4', 'aaaaaaaa-0000-4000-8000-000000000001', 'e4e4e4e4-0000-4000-8000-0000000000e4', 'COLABORADOR', 'suspended');

-- 1. Padrão sugerido ao convidar (PDD §10.4.3)
select is((select count(*)::int from platform.membership_permission where membership_id = '11111111-0000-4000-8000-0000000000a1'),
  0, 'ADMIN não recebe linhas na matriz (passa em tudo)');
select results_eq(
  $$ select module || ':' || action from platform.membership_permission
      where membership_id = '11111111-0000-4000-8000-0000000000c1' order by 1 $$,
  $$ values ('appointments:create'), ('appointments:edit'), ('appointments:view'), ('atta:view'),
            ('patients:create'), ('patients:edit'), ('patients:view') $$,
  'COLABORADOR novo recebe o padrão: Agendamentos e Pacientes (ver, criar, editar) e ATTA (ver)');

-- 2. has_permission do COLABORADOR com o padrão
set local role authenticated;
select pg_temp.como('c1c1c1c1-0000-4000-8000-0000000000c1', 'COLABORADOR');
select ok(private.has_permission('appointments', 'edit'), 'COLABORADOR padrão edita Agendamentos');
select ok(private.has_permission('patients', 'create'), 'COLABORADOR padrão cria Pacientes');
select ok(private.has_permission('atta', 'view'), 'COLABORADOR padrão vê o ATTA');
select is(private.has_permission('documents', 'view'), false, 'COLABORADOR padrão não vê Termos & Docs');
select is(private.has_permission('metrics', 'view'), false, 'COLABORADOR padrão não vê Métricas');
select is(private.has_permission('settings', 'view'), false, 'Configurações: nunca ao COLABORADOR');
select is(private.has_permission('team', 'view'), false, 'Equipe & Permissões: nunca ao COLABORADOR');
select is(private.has_permission('audit', 'view'), false, 'Auditoria: nunca ao COLABORADOR');

-- 3. RLS: a própria matriz sim; a dos outros, não; ninguém escreve pela tabela
select is((select count(*)::int from platform.membership_permission), 7, 'COLABORADOR vê só a própria matriz');
select throws_ok($$ insert into platform.membership_permission (tenant_id, membership_id, module, action)
  values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-0000000000c1', 'documents', 'view') $$,
  '42501', null, 'COLABORADOR não se dá permissão pela tabela');
select throws_ok($$ delete from platform.membership_permission $$, '42501', null, 'ninguém apaga permissão pela tabela');

select pg_temp.como('a1a1a1a1-0000-4000-8000-0000000000a1', 'ADMIN', 'aal2');
select is((select count(*)::int from platform.membership_permission), 21,
  'ADMIN vê a matriz da equipe da própria clínica (3 COLABORADORES × 7), nunca a da clínica B');
select throws_ok($$ update platform.membership_permission set module = 'documents' $$, '42501', null,
  'ADMIN não muda a matriz pela tabela (só por api.team_set_permissions)');
select ok(private.has_permission('documents', 'edit'), 'ADMIN passa em tudo, sem linha na matriz');
select ok(private.has_permission('audit', 'view'), 'ADMIN vê a Auditoria');
select pg_temp.como('a1a1a1a1-0000-4000-8000-0000000000a1', 'ADMIN', 'aal1');
select is(private.has_permission('documents', 'view'), false, 'ADMIN sem aal2 continua sem permissão (MIG-03)');
reset role;

-- 4. Pares proibidos e "criar e editar exigem visualizar" (direto como dono, para provar as constraints)
select throws_ok($$ insert into platform.membership_permission (tenant_id, membership_id, module, action)
  values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-0000000000c2', 'atta', 'create') $$,
  '23514', null, 'ATTA só tem visualizar');
select throws_ok($$ insert into platform.membership_permission (tenant_id, membership_id, module, action)
  values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-0000000000c2', 'metrics', 'edit') $$,
  '23514', null, 'Métricas só tem visualizar');
select throws_ok($$ insert into platform.membership_permission (tenant_id, membership_id, module, action)
  values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-0000000000c2', 'settings', 'view') $$,
  '23514', null, 'Configurações nunca entra na matriz');
select throws_ok($$ insert into platform.membership_permission (tenant_id, membership_id, module, action)
  values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-0000000000c2', 'team', 'view') $$,
  '23514', null, 'Equipe & Permissões nunca entra na matriz');
select throws_ok($$ insert into platform.membership_permission (tenant_id, membership_id, module, action)
  values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-0000000000c2', 'audit', 'view') $$,
  '23514', null, 'Auditoria nunca entra na matriz');
select throws_ok($$ insert into platform.membership_permission (tenant_id, membership_id, module, action)
  values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-0000000000c2', 'documents', 'create') $$,
  '23514', null, 'criar sem visualizar é recusado');
select lives_ok($$ insert into platform.membership_permission (tenant_id, membership_id, module, action)
  values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-0000000000c2', 'documents', 'create'),
         ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-0000000000c2', 'documents', 'view') $$,
  'visualizar e criar no mesmo comando passam');
select throws_ok($$ delete from platform.membership_permission
  where membership_id = '11111111-0000-4000-8000-0000000000c2' and module = 'documents' and action = 'view' $$,
  '23514', null, 'tirar o visualizar de quem ainda cria é recusado');
select throws_ok($$ insert into platform.membership_permission (tenant_id, membership_id, module, action)
  values ('bbbbbbbb-0000-4000-8000-000000000002', '11111111-0000-4000-8000-0000000000c2', 'metrics', 'view') $$,
  '23503', null, 'permissão com clínica diferente da do vínculo é recusada (FK composta)');

-- 5. Liberar e tirar valem na hora, sem esperar o token
insert into platform.membership_permission (tenant_id, membership_id, module, action)
  values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-0000000000c1', 'metrics', 'view');
set local role authenticated;
select pg_temp.como('c1c1c1c1-0000-4000-8000-0000000000c1', 'COLABORADOR');
select ok(private.has_permission('metrics', 'view'), 'Métricas liberada ao COLABORADOR passa na hora');
reset role;
delete from platform.membership_permission
 where membership_id = '11111111-0000-4000-8000-0000000000c1' and module = 'appointments' and action in ('edit', 'create');
set local role authenticated;
select pg_temp.como('c1c1c1c1-0000-4000-8000-0000000000c1', 'COLABORADOR');
select is(private.has_permission('appointments', 'edit'), false, 'tirar o editar corta na hora');
select ok(private.has_permission('appointments', 'view'), 'o visualizar continua');

-- 6. Suspenso não passa, mesmo com a matriz
select pg_temp.como('e4e4e4e4-0000-4000-8000-0000000000e4', 'COLABORADOR');
select is(private.has_permission('appointments', 'view'), false, 'COLABORADOR suspenso: nenhuma permissão, mesmo com a matriz');
reset role;

-- 7. ADMIN que vira COLABORADOR recebe o padrão (e só ele)
update platform.membership set app_role = 'COLABORADOR' where id = '11111111-0000-4000-8000-0000000000a1';
select is((select count(*)::int from platform.membership_permission where membership_id = '11111111-0000-4000-8000-0000000000a1'),
  7, 'ADMIN rebaixado a COLABORADOR recebe o padrão sugerido');
set local role authenticated;
select pg_temp.como('a1a1a1a1-0000-4000-8000-0000000000a1', 'ADMIN', 'aal2');
select is(private.has_permission('team', 'view'), false, 'vale o papel do banco: o claim ADMIN antigo não dá Equipe');
reset role;

-- 8. As funções dos gatilhos não são chamáveis de fora
select is(has_function_privilege('authenticated', 'private.membership_default_permissions()', 'EXECUTE'), false,
  'authenticated não executa a função do padrão');
select is(has_function_privilege('authenticated', 'private.membership_apply_default_permissions(uuid, uuid)', 'EXECUTE'),
  false, 'authenticated não executa o backfill do padrão');

-- 9. Backfill: o COLABORADOR que existia antes da migration (sem nenhuma linha) recebe o padrão
delete from platform.membership_permission where membership_id = '11111111-0000-4000-8000-0000000000c2';
select private.membership_apply_default_permissions('11111111-0000-4000-8000-0000000000c2', 'aaaaaaaa-0000-4000-8000-000000000001');
select is((select count(*)::int from platform.membership_permission where membership_id = '11111111-0000-4000-8000-0000000000c2'),
  7, 'COLABORADOR antigo sem linhas recebe o padrão sugerido no backfill');
select lives_ok($$ select private.membership_apply_default_permissions('11111111-0000-4000-8000-0000000000c2',
  'aaaaaaaa-0000-4000-8000-000000000001') $$, 'o backfill roda de novo sem duplicar (on conflict)');

-- 10. A mesma pessoa em duas clínicas: a matriz é por vínculo (sugestão da Segurança)
insert into platform.membership (id, tenant_id, user_id, app_role) values
  ('11111111-0000-4000-8000-0000000000d2', 'bbbbbbbb-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-0000000000c2', 'COLABORADOR');
insert into platform.membership_permission (tenant_id, membership_id, module, action)
  values ('bbbbbbbb-0000-4000-8000-000000000002', '11111111-0000-4000-8000-0000000000d2', 'metrics', 'view');
set local role authenticated;
select pg_temp.como('c2c2c2c2-0000-4000-8000-0000000000c2', 'COLABORADOR');
select is(private.has_permission('metrics', 'view'), false, 'Métricas liberada na clínica B não vale com o token da A');
select set_config('request.jwt.claims', pg_temp.com_login('{"sub":"c2c2c2c2-0000-4000-8000-0000000000c2","role":"authenticated","tenant_id":"bbbbbbbb-0000-4000-8000-000000000002","app_role":"COLABORADOR","aal":"aal1"}'), true);
select ok(private.has_permission('metrics', 'view'), 'com o token da B, vale a matriz da B');
reset role;

select * from finish();
rollback;
