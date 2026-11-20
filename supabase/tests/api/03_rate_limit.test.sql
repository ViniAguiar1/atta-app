-- MIG-24 (plataforma): limitador de tentativas único (ADR 0004 §2). Chaves de teste são bytes fixos, não IPs.
begin;
select plan(20);

create function pg_temp.k(p_n int) returns bytea language sql as $$
  select decode(lpad(to_hex(p_n), 64, '0'), 'hex')
$$;
create function pg_temp.bater(p_bucket text, p_key bytea, p_limit int, p_window int, p_vezes int) returns boolean[]
language plpgsql as $$
declare r boolean[] := '{}';
begin
  for i in 1..p_vezes loop
    r := r || api.rate_limit_hit(p_bucket, p_key, p_limit, p_window);
  end loop;
  return r;
end $$;
do $$ begin
  execute format('grant execute on all functions in schema %I to service_role, authenticated', pg_my_temp_schema()::regnamespace);
end $$;

-- estrutura e permissões ------------------------------------------------------------------------------------------
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'private.rate_limit_counter'::regclass),
          'contador com RLS ligada e forçada');
select ok(not has_table_privilege('anon', 'private.rate_limit_counter', 'SELECT')
          and not has_table_privilege('authenticated', 'private.rate_limit_counter', 'SELECT')
          and not has_table_privilege('service_role', 'private.rate_limit_counter', 'SELECT')
          and not has_table_privilege('service_role', 'private.rate_limit_counter', 'INSERT'),
          'ninguém da API lê ou grava o contador pela tabela');
select ok(not has_function_privilege('anon', 'api.rate_limit_hit(text, bytea, integer, integer)', 'EXECUTE'),
          'anon não chama o limitador (o navegador não pula o limite)');
select ok(not has_function_privilege('authenticated', 'api.rate_limit_hit(text, bytea, integer, integer)', 'EXECUTE'),
          'authenticated não chama o limitador');
select ok(has_function_privilege('service_role', 'api.rate_limit_hit(text, bytea, integer, integer)', 'EXECUTE'),
          'só o servidor (service_role) chama');
select is((select prosecdef from pg_proc where oid = 'api.rate_limit_hit(text, bytea, integer, integer)'::regprocedure)
          and (select proconfig @> array['search_path=""'] from pg_proc
               where oid = 'api.rate_limit_hit(text, bytea, integer, integer)'::regprocedure),
          true, 'SECURITY DEFINER com search_path vazio');

-- contagem ---------------------------------------------------------------------------------------------------------
set local role service_role;
select is(pg_temp.bater('teste.ip', pg_temp.k(1), 3, 60, 5), array[true, true, true, false, false],
          'três dentro do limite, o quarto e o quinto passam do limite');
select is(api.rate_limit_hit('teste.ip', pg_temp.k(2), 3, 60), true, 'outra chave tem contador próprio');
select is(api.rate_limit_hit('teste.portal', pg_temp.k(1), 3, 60), true, 'outro bucket tem contador próprio');
reset role;
select is((select hits from private.rate_limit_counter where bucket = 'teste.ip' and key_hash = pg_temp.k(1)), 4,
          'o contador para em limite + 1, sem crescer sob ataque');

-- janela vencida sai na própria chamada ----------------------------------------------------------------------------
insert into private.rate_limit_counter (bucket, key_hash, window_start, hits)
values ('teste.ip', pg_temp.k(9), now() - interval '1 hour', 99),
       ('teste.outro', pg_temp.k(9), now() - interval '1 hour', 99);
set local role service_role;
select is(api.rate_limit_hit('teste.ip', pg_temp.k(9), 3, 60), true, 'a janela antiga não conta para a atual');
reset role;
select is((select count(*)::int from private.rate_limit_counter
           where bucket = 'teste.ip' and window_start < now() - interval '30 minutes'), 0,
          'a janela vencida do bucket foi apagada');
select is((select count(*)::int from private.rate_limit_counter where bucket = 'teste.outro'), 1,
          'a limpeza não mexe em outro bucket');

-- validação ----------------------------------------------------------------------------------------------------
set local role service_role;
select throws_ok($$ select api.rate_limit_hit('Teste IP', pg_temp.k(1), 3, 60) $$, 'P0001', 'ATTA-IN-0001',
                 'bucket fora do formato é recusado');
select throws_ok($$ select api.rate_limit_hit('teste.ip', decode('00', 'hex'), 3, 60) $$, 'P0001', 'ATTA-IN-0001',
                 'chave que não tem 32 bytes é recusada (o valor cru não entra)');
select throws_ok($$ select api.rate_limit_hit('teste.ip', convert_to('203.0.113.7', 'UTF8'), 3, 60) $$,
                 'P0001', 'ATTA-IN-0001', 'IP em texto no lugar do HMAC é recusado');
select throws_ok($$ select api.rate_limit_hit('teste.ip', pg_temp.k(1), 0, 60) $$, 'P0001', 'ATTA-IN-0001',
                 'limite zero é recusado');
select throws_ok($$ select api.rate_limit_hit('teste.ip', pg_temp.k(1), 3, 0) $$, 'P0001', 'ATTA-IN-0001',
                 'janela zero é recusada');
select throws_ok($$ select api.rate_limit_hit('teste.ip', pg_temp.k(1), 3, 86401) $$, 'P0001', 'ATTA-IN-0001',
                 'janela maior que um dia é recusada');
reset role;

set local role authenticated;
select throws_ok($$ select api.rate_limit_hit('teste.ip', pg_temp.k(1), 3, 60) $$, '42501', null,
                 'authenticated chamando é barrado pelo banco');
reset role;

select * from finish();
rollback;
