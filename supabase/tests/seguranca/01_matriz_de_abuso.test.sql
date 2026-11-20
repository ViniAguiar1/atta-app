-- Matriz de abuso (Segurança; auditoria S2-3 e S3-1; PDD v206 §19.3 e §19.4; ADR 0001 §2). Duas personas sem direito
-- a dado nenhum passam por TODA tabela e view exposta e por TODA função que authenticated executa, inclusive as que
-- ainda vão nascer:
--   (a) conta sem clínica: o que sobra de um cadastro público (o S2-3 fechou o signup, mas a regra fica no banco);
--   (b) ADMIN sem o segundo fator (aal1): só a própria clínica e o próprio vínculo (a tela leva ao 2º fator).
-- Tabela: SELECT tem de voltar 0 linhas (exceções na lista abaixo). Função: chamada com todos os argumentos nulos, tem
-- de recusar (qualquer erro) ou não devolver nada; função void que roda sem erro também é acusada. Com autoteste.
-- Exceção nova: só com o ok da Segurança e do TL, com o motivo. Só dados fictícios.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- ---------------------------------------------------------------------------------------------------------------
-- Exceções, com o motivo
-- ---------------------------------------------------------------------------------------------------------------
create temp table seg_tabela_liberada (persona text, nome text, motivo text) on commit drop;
insert into seg_tabela_liberada values
  ('*', 'atta_in.setting_definition', 'catálogo global de parâmetros, sem dado de clínica'),
  ('admin_aal1', 'platform.tenant', 'a própria clínica, para a tela levar ao 2º fator (ADR 0001 §2)'),
  ('admin_aal1', 'platform.membership', 'o próprio vínculo, para a tela levar ao 2º fator (ADR 0001 §2)');
grant select on seg_tabela_liberada to authenticated;

create temp table seg_funcao_liberada (nome text, motivo text) on commit drop;
grant select on seg_funcao_liberada to authenticated;

create temp table seg_vazamento (persona text, tipo text, nome text, detalhe text) on commit drop;
grant select, insert on seg_vazamento to authenticated;

-- o código de cada recusa de função: para essas personas, só 42501 (sem permissão) e P0002 (não encontrado) são
-- recusa limpa; outro código (ex.: P0001 de argumento) antes da permissão é oráculo (sugestão do TL no #102)
create temp table seg_recusa (persona text, nome text, estado text) on commit drop;
grant select, insert on seg_recusa to authenticated;
create temp table seg_recusa_liberada (nome text, motivo text) on commit drop;
grant select on seg_recusa_liberada to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Dados fictícios de uma clínica (como dono: passa por cima da RLS). Outras clínicas não importam: as personas não
-- podem ver nem os dados da própria.
-- ---------------------------------------------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('5e900000-0000-4000-8000-000000000001', 'admin.abuso@exemplo.test', 'authenticated', 'authenticated'),
  ('5e900000-0000-4000-8000-000000000002', 'sem.clinica@exemplo.test', 'authenticated', 'authenticated');
insert into platform.tenant (id, name) values ('5e90aaaa-0000-4000-8000-000000000001', 'Clínica Abuso Ficticia');
insert into platform.membership (tenant_id, user_id, app_role)
  values ('5e90aaaa-0000-4000-8000-000000000001', '5e900000-0000-4000-8000-000000000001', 'ADMIN');
insert into atta_in.setting (tenant_id, key, level, value_int)
  values ('5e90aaaa-0000-4000-8000-000000000001', 'janela_de_confirmacao_h', 'unidade', 48);
insert into documents.template (tenant_id, kind, title, frequency, required, draft_body)
  values ('5e90aaaa-0000-4000-8000-000000000001', 'tcle', 'Termo fictício', 'por_procedimento', true, 'Texto fictício.');

-- tabelas e views dos schemas expostos que authenticated pode ler
create temp table seg_alvo_tabela (nome text, linhas_reais bigint) on commit drop;
grant select on seg_alvo_tabela to authenticated;
do $$
declare r record; n bigint;
begin
  for r in
    select format('%I.%I', n.nspname, c.relname) as nome
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('platform', 'documents', 'atta_in', 'api', 'public')
       and c.relkind in ('r', 'p', 'v', 'm', 'f')
       and (has_table_privilege('authenticated', c.oid, 'SELECT') or has_any_column_privilege('authenticated', c.oid, 'SELECT'))
  loop
    execute format('select count(*) from %s', r.nome) into n;
    insert into seg_alvo_tabela values (r.nome, n);
  end loop;
end $$;

-- funções que authenticated executa (fora as de policy do private e as de gatilho)
create temp table seg_alvo_funcao (nome text, chamada text, retorno text) on commit drop;
grant select on seg_alvo_funcao to authenticated;
insert into seg_alvo_funcao
select p.oid::regprocedure::text,
       format('%I.%I(%s)', n.nspname, p.proname,
              coalesce((select string_agg(format('NULL::%s', format_type(t, null)), ', ' order by o)
                          from unnest(p.proargtypes) with ordinality u(t, o)), '')),
       case when p.prorettype = 'void'::regtype then 'void' when p.proretset then 'set' else 'scalar' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('platform', 'documents', 'atta_in', 'api', 'public')
   and p.prokind = 'f'
   and p.prorettype <> 'trigger'::regtype
   and has_function_privilege('authenticated', p.oid, 'EXECUTE')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');

-- ---------------------------------------------------------------------------------------------------------------
-- A varredura, rodando como a persona (authenticated, com o token simulado): a RLS e os grants valem de verdade
-- ---------------------------------------------------------------------------------------------------------------
create function pg_temp.seg_varrer(p_persona text) returns void language plpgsql as $$
declare r record; n bigint; v text; e text;
begin
  for r in select a.nome from seg_alvo_tabela a
            where not exists (select 1 from seg_tabela_liberada l where l.nome = a.nome and l.persona in ('*', p_persona))
  loop
    begin
      execute format('select count(*) from %s', r.nome) into n;
      if n > 0 then insert into seg_vazamento values (p_persona, 'tabela', r.nome, n || ' linha(s)'); end if;
    exception when others then null;   -- recusar a leitura também é não vazar
    end;
  end loop;
  for r in select f.* from seg_alvo_funcao f where not exists (select 1 from seg_funcao_liberada l where l.nome = f.nome)
  loop
    begin
      if r.retorno = 'set' then
        execute format('select count(*) from %s', r.chamada) into n;
        if n > 0 then insert into seg_vazamento values (p_persona, 'função', r.nome, n || ' linha(s)'); end if;
      elsif r.retorno = 'void' then
        execute format('select %s', r.chamada);
        insert into seg_vazamento values (p_persona, 'função', r.nome, 'void rodou sem recusa');
      else
        execute format('select (%s)::text', r.chamada) into v;
        if v is not null then insert into seg_vazamento values (p_persona, 'função', r.nome, 'devolveu valor'); end if;
      end if;
    exception when others then
      get stacked diagnostics e = returned_sqlstate;   -- recusa é o esperado; o código vai para a seg_recusa
      insert into seg_recusa values (p_persona, r.nome, e);
    end;
  end loop;
end $$;
grant execute on function pg_temp.seg_varrer(text) to authenticated;

create function pg_temp.seg_token(p_sub text, p_extra jsonb) returns text language sql as $$
  select (jsonb_build_object('sub', p_sub, 'role', 'authenticated', 'aud', 'authenticated', 'aal', 'aal1',
            'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)))
          || p_extra)::text
$$;

-- 1: a varredura tem dado de verdade para enxergar (senão o "0 linhas" não prova nada)
select ok((select count(*) from seg_alvo_tabela where linhas_reais > 0) >= 3
          and (select count(*) from seg_alvo_funcao) >= 10,
  'há tabelas com dados e funções expostas para varrer');

-- 2 e 3: conta sem clínica
select set_config('request.jwt.claims', pg_temp.seg_token('5e900000-0000-4000-8000-000000000002', '{}'), true);
set local role authenticated;
select pg_temp.seg_varrer('sem_clinica');
reset role;
select set_config('request.jwt.claims', '', true);
select is_empty($$ select nome || ' (' || detalhe || ')' from seg_vazamento where persona = 'sem_clinica' and tipo = 'tabela' $$,
  'conta sem clínica: nenhuma tabela exposta devolve linha');
select is_empty($$ select nome || ' (' || detalhe || ')' from seg_vazamento where persona = 'sem_clinica' and tipo = 'função' $$,
  'conta sem clínica: nenhuma função exposta devolve dado nem age');

-- 4 e 5: ADMIN sem o segundo fator
select set_config('request.jwt.claims', pg_temp.seg_token('5e900000-0000-4000-8000-000000000001',
  '{"tenant_id":"5e90aaaa-0000-4000-8000-000000000001","app_role":"ADMIN"}'), true);
set local role authenticated;
select pg_temp.seg_varrer('admin_aal1');
reset role;
select set_config('request.jwt.claims', '', true);
select is_empty($$ select nome || ' (' || detalhe || ')' from seg_vazamento where persona = 'admin_aal1' and tipo = 'tabela' $$,
  'ADMIN sem 2º fator: só a própria clínica e o próprio vínculo; nenhuma outra tabela devolve linha');
select is_empty($$ select nome || ' (' || detalhe || ')' from seg_vazamento where persona = 'admin_aal1' and tipo = 'função' $$,
  'ADMIN sem 2º fator: nenhuma função exposta devolve dado nem age');

-- 6 e 7: recusa limpa. Para essas personas, só 42501 (sem permissão) e P0002 (não encontrado); outro código (ex.:
-- P0001 de argumento) antes da permissão é oráculo (sugestão do TL no #102). Exceção nova só com o motivo, na lista.
select is_empty($$ select distinct persona || ' ' || nome || ' ' || estado from seg_recusa r
                    where r.estado not in ('42501', 'P0002')
                      and not exists (select 1 from seg_recusa_liberada l where l.nome = r.nome) $$,
  'toda recusa às personas sem direito é 42501 ou P0002 (nada de validar argumento antes da permissão)');
-- public vazio (ADR 0001 §1): nem tabela, view ou sequência, nem função ou procedure. O PostgREST expõe as funções do
-- public como RPC, fora do api. Ficam de fora só os objetos de extensão (sugestão do TL no #112).
create temp view seg_public_objeto as
select format('%I.%I', n.nspname, c.relname) as nome from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
   and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
union all
select format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e');
select is_empty($$ select nome from seg_public_objeto $$,
  'o schema public continua vazio (nenhuma tabela, view, sequência ou função fora de extensão)');

-- 8: a exceção do ADMIN sem 2º fator é mesmo só a própria clínica e o próprio vínculo
select set_config('request.jwt.claims', pg_temp.seg_token('5e900000-0000-4000-8000-000000000001',
  '{"tenant_id":"5e90aaaa-0000-4000-8000-000000000001","app_role":"ADMIN"}'), true);
set local role authenticated;
select is((select count(*)::int from platform.tenant) + (select count(*)::int from platform.membership), 2,
  'ADMIN sem 2º fator vê 1 clínica (a dele) e 1 vínculo (o dele)');
reset role;
select set_config('request.jwt.claims', '', true);

-- 9 a 11: autoteste, com uma tabela e duas funções que vazam, criadas só nesta transação
create table atta_in.seg_autoteste_vaza (id int);
alter table atta_in.seg_autoteste_vaza enable row level security;
alter table atta_in.seg_autoteste_vaza force row level security;
insert into atta_in.seg_autoteste_vaza values (1);
grant select on atta_in.seg_autoteste_vaza to authenticated;
create policy seg_vaza on atta_in.seg_autoteste_vaza for select to authenticated using (true);
create function api.seg_autoteste_vaza_linhas(p uuid) returns setof int language sql security definer set search_path = ''
  as $$ select 1 $$;
create function api.seg_autoteste_age(p uuid) returns void language sql security definer set search_path = ''
  as $$ select $$;
grant execute on function api.seg_autoteste_vaza_linhas(uuid), api.seg_autoteste_age(uuid) to authenticated;
insert into seg_alvo_tabela values ('atta_in.seg_autoteste_vaza', 1);
insert into seg_alvo_funcao values
  ('api.seg_autoteste_vaza_linhas(uuid)', 'api.seg_autoteste_vaza_linhas(NULL::uuid)', 'set'),
  ('api.seg_autoteste_age(uuid)', 'api.seg_autoteste_age(NULL::uuid)', 'void');
delete from seg_vazamento;
select set_config('request.jwt.claims', pg_temp.seg_token('5e900000-0000-4000-8000-000000000002', '{}'), true);
set local role authenticated;
select pg_temp.seg_varrer('autoteste');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select string_agg(nome, ',') from seg_vazamento where tipo = 'tabela'), 'atta_in.seg_autoteste_vaza',
  'o autoteste acusa a tabela com policy aberta');
select is((select string_agg(nome, ',' order by nome) from seg_vazamento where tipo = 'função'),
  'api.seg_autoteste_age(uuid),api.seg_autoteste_vaza_linhas(uuid)',
  'o autoteste acusa a função que devolve linha e a void que age sem recusar');
select is((select count(*)::int from seg_vazamento), 3, 'e não acusa mais nada');

-- 12: autoteste do public vazio, com uma função e uma sequência criadas só nesta transação
create function public.seg_autoteste_publico() returns int language sql as $$ select 1 $$;
create sequence public.seg_autoteste_seq;
select is((select string_agg(nome, ',' order by nome) from seg_public_objeto),
  'public.seg_autoteste_publico(),public.seg_autoteste_seq',
  'o autoteste acusa a função e a sequência no public');

select * from finish();
rollback;
