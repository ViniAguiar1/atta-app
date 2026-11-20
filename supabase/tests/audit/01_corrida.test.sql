-- MIG-04: a cadeia não bifurca sob concorrência (achado do Backend 1). Esta transação roda em repeatable read e tira a
-- foto; uma segunda conexão (dblink, a mesma instância local) grava e commita; a gravação daqui tem de falhar com 40001
-- em vez de criar um segundo evento com o mesmo prev_hash. Só dados fictícios. A conexão do dblink usa a senha padrão
-- do Supabase local (não é segredo; não existe na nuvem).
-- O evento da outra conexão fica commitado de propósito: a trilha é só de inserção e não se apaga nem em teste. Ele é um
-- evento legítimo da cadeia, e rodar a suíte de novo sem reset prova que a cadeia segue íntegra com eventos antigos.
begin isolation level repeatable read;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(4);

-- cada lado usa a sua ação: a desta transação nasce aqui (visível na foto); a da outra conexão entra commitada por ela
-- (catálogo é só de inserção). O que as duas disputam é só a cabeça da cadeia.
insert into audit.action (action, kind, scope) values ('teste.corrida_a', 'access', 'network');
-- pelo endereço de rede do próprio banco (o de loopback entra sem senha, e o dblink de quem não é superusuário exige senha)
select extensions.dblink_connect('outra', format('host=%s port=%s dbname=%s user=postgres password=postgres',
  coalesce(host(inet_server_addr()), '127.0.0.1'), coalesce(inet_server_port(), 5432), current_database()));
select extensions.dblink_exec('outra', $$insert into audit.action (action, kind, scope) values ('teste.corrida_b', 'access', 'network') on conflict do nothing$$);

-- a foto desta transação é tirada aqui (primeira leitura da tabela)
select ok((select count(*) from audit.event) >= 0, 'foto da transação tirada antes da gravação concorrente');

-- a outra conexão grava e commita
select is(
  (select ok from extensions.dblink('outra', $$select audit.record_event('teste.corrida_b', 'platform.tenant', null) is not null$$) as t(ok boolean)),
  true, 'a outra conexão gravou e commitou');

-- aqui, com a foto velha: recusa por serialização, nunca um evento com o prev_hash repetido
select throws_ok($$ select audit.record_event('teste.corrida_a', 'platform.tenant', null) $$, '40001', null,
  'repeatable read com cabeça movida: 40001 (quem chama tenta de novo), sem bifurcar a cadeia');

-- a cadeia vista pela outra conexão (já commitada) segue íntegra
select is(
  (select v from extensions.dblink('outra', $$select coalesce(audit.verify_chain()::text, 'íntegra')$$) as t(v text)),
  'íntegra', 'verify_chain íntegra depois da corrida');

select extensions.dblink_disconnect('outra');
select * from finish();
rollback;
