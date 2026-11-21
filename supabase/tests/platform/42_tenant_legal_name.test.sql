-- MIG-02: razão social da clínica. Só dado fictício.
begin;
select plan(7);

select has_column('platform', 'tenant', 'legal_name', 'platform.tenant tem legal_name');
select col_is_null('platform', 'tenant', 'legal_name', 'legal_name é nula por enquanto');

insert into platform.tenant (id, name) values ('00000000-0000-4000-8000-0000000004e1', 'Clínica Fictícia Razão');
select is((select legal_name from platform.tenant where id = '00000000-0000-4000-8000-0000000004e1'), null,
  'clínica nova nasce sem razão social');
select lives_ok($$ update platform.tenant set legal_name = 'Fictícia Serviços de Saúde Ltda.' where id = '00000000-0000-4000-8000-0000000004e1' $$,
  'o servidor grava a razão social');
select throws_ok($$ update platform.tenant set legal_name = ' ' where id = '00000000-0000-4000-8000-0000000004e1' $$,
  '23514', null, 'razão social em branco é recusada');
select throws_ok($$ update platform.tenant set legal_name = ' Fictícia Ltda. ' where id = '00000000-0000-4000-8000-0000000004e1' $$,
  '23514', null, 'razão social com espaço nas pontas é recusada');
-- nenhum grant novo: o authenticated continua sem update nessa coluna (a escrita vem com o Perfil da Clínica)
select ok(not has_column_privilege('authenticated', 'platform.tenant', 'legal_name', 'UPDATE'),
  'authenticated não altera a razão social por enquanto');

select * from finish();
rollback;
