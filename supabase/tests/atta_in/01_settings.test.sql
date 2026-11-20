-- MIG-10: configurações em cascata (porte dos testes do ENG-186: test_config_cascade, test_rls e test_settings).
begin;
select plan(49);

-- duas clínicas fictícias e um Serviço fictício (o catálogo de Serviços chega no MIG-11)
insert into platform.tenant (id, name) values
  ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A'),
  ('00000000-0000-4000-8000-00000000000b', 'Clínica Fictícia B');
-- o Serviço fictício da exceção por Serviço (a FK para atta_in.clinic_service entra no MIG-11)
insert into atta_in.clinic_service (id, tenant_id, name, duration_min)
values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000000a', 'Limpeza de Pele Fictícia', 60);

create function pg_temp.entrar(p_tenant uuid, p_role text) returns void language plpgsql as $$
declare
  v_user uuid := gen_random_uuid();
begin
  -- usuário fictício com vínculo ativo na clínica: o has_permission do MIG-02 confere o vínculo no banco
  perform set_config('role', 'postgres', true);
  insert into auth.users (id, email) values (v_user, v_user::text || '@teste.invalid');
  if p_tenant is not null and p_role in ('ADMIN', 'COLABORADOR') then
    -- no máximo 2 ADMIN vivos por clínica (MIG-06, PDD §10.4.3): com 2, entra como um deles
    if p_role = 'ADMIN' and (select count(*) from platform.membership m where m.tenant_id = p_tenant
        and m.app_role = 'ADMIN' and m.deleted_at is null and m.status <> 'rejected') >= 2 then
      select m.user_id into v_user from platform.membership m where m.tenant_id = p_tenant and m.app_role = 'ADMIN'
         and m.status = 'active' and m.deleted_at is null order by m.created_at limit 1;
    else
      insert into platform.membership (tenant_id, user_id, app_role) values (p_tenant, v_user, p_role);
    end if;
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'tenant_id', p_tenant, 'app_role', p_role,
      'aal', 'aal2',
                      -- hora do login (MIG-03: sessão de no máximo 12 h, has_permission confere)
                      'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)))::text, true); -- sessão com o 2º fator: o ADMIN sem aal2 não tem permissão (MIG-03)
end $$;

create function pg_temp.remover_vinculo() returns void language plpgsql as $$
begin
  -- o vínculo sai do banco, mas o token continua válido (regra da ADR 0001 §2, revisão do MIG-02)
  perform set_config('role', 'postgres', true);
  update platform.membership set deleted_at = now()
  where user_id = (current_setting('request.jwt.claims')::jsonb ->> 'sub')::uuid;
  perform set_config('role', 'authenticated', true);
end $$;


create function pg_temp.sair() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.efetivo(p_key text, p_type text default null, p_service uuid default null)
  returns text language sql as $$
  select value::text || ' ' || level from atta_in.effective_settings(p_type, p_service) where key = p_key
$$;

create function pg_temp.alterar_da_a() returns int language plpgsql as $$
declare n int;
begin
  update atta_in.setting set value_int = 15 where tenant_id = '00000000-0000-4000-8000-00000000000a';
  get diagnostics n = row_count;
  return n;
end $$;

do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated',
                 pg_my_temp_schema()::regnamespace);
end $$;

-- estrutura -------------------------------------------------------------------------------------------------------
select has_schema('atta_in');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'atta_in.setting'::regclass),
          'setting com RLS ligada e forçada');
select ok((select relrowsecurity and relforcerowsecurity from pg_class
           where oid = 'atta_in.setting_definition'::regclass), 'setting_definition com RLS ligada e forçada');
select ok(not has_table_privilege('authenticated', 'atta_in.setting', 'DELETE'), 'a app não apaga configuração');
select ok(not has_table_privilege('anon', 'atta_in.setting', 'SELECT'), 'anon não lê configuração');
select ok(not has_function_privilege('anon', 'atta_in.set_setting(text, jsonb, text, uuid)', 'EXECUTE'),
          'anon não grava configuração');
select results_eq(
  $$ select key, value_type, default_int, default_bool from atta_in.setting_definition order by key $$,
  $$ values ('fluxo_alternativo_habilitado'::text, 'bool'::text, null::bigint, true),
            ('janela_de_confirmacao_h', 'int', 72::bigint, null::boolean),
            ('tolerancia_da_ausencia_min', 'int', 120::bigint, null::boolean) $$,
  'catálogo com os padrões do PDD: 72 h, 2 h e fluxo alternativo habilitado');

-- ADMIN sem o 2º fator (aal1) não lê nem grava configuração (regra do dono, MIG-03; has_permission)
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select set_config('request.jwt.claims',
  (current_setting('request.jwt.claims')::jsonb || '{"aal":"aal1"}')::text, true);
select throws_ok($$ select pg_temp.efetivo('janela_de_confirmacao_h') $$, '42501', 'ATTA-AUTH-0004',
                 'ADMIN em aal1 é recusado');

-- sem nada gravado, tudo vem do sistema -------------------------------------------------------------------------------
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select is(pg_temp.efetivo('janela_de_confirmacao_h'), '72 sistema', 'janela padrão: 72 h do sistema');
select is(pg_temp.efetivo('tolerancia_da_ausencia_min'), '120 sistema', 'tolerância padrão: 2 h do sistema');
select is(pg_temp.efetivo('fluxo_alternativo_habilitado'), 'true sistema', 'fluxo alternativo padrão: habilitado');

-- Pronto quando 1: 2 h na unidade e 1 h para Retorno ---------------------------------------------------------------
select is((select level from atta_in.set_setting('tolerancia_da_ausencia_min', '120')), 'unidade',
          'passo 1: 2 h gravadas na unidade');
select is((select level from atta_in.set_setting('tolerancia_da_ausencia_min', '60', 'retorno')),
          'tipo_de_atendimento', 'passo 1: 1 h gravada para Retorno');

-- Pronto quando 2: Retorno devolve 1 h (tipo de atendimento); Consulta devolve 2 h (unidade) -----------------------
select is(pg_temp.efetivo('tolerancia_da_ausencia_min', 'retorno'), '60 tipo_de_atendimento',
          'passo 2: Retorno devolve 1 h, com origem no tipo de atendimento');
select is(pg_temp.efetivo('tolerancia_da_ausencia_min', 'consulta'), '120 unidade',
          'passo 2: Consulta devolve 2 h, com origem na unidade');

-- Pronto quando 3: exceção para Avaliação é aceita e vale só para ela -----------------------------------------------
select is((select level from atta_in.set_setting('tolerancia_da_ausencia_min', '30', 'avaliacao')),
          'tipo_de_atendimento', 'passo 3: exceção para Avaliação aceita');
select is(pg_temp.efetivo('tolerancia_da_ausencia_min', 'avaliacao'), '30 tipo_de_atendimento',
          'passo 3: Avaliação devolve a própria exceção');
select is(pg_temp.efetivo('tolerancia_da_ausencia_min', 'procedimento'), '120 unidade',
          'passo 3: Procedimento segue na unidade');

-- cascata completa e gravação no mesmo escopo -------------------------------------------------------------------------
select is((select level from atta_in.set_setting('tolerancia_da_ausencia_min', '15', null,
                                                 '00000000-0000-4000-8000-0000000000c1')), 'servico',
          'exceção por Serviço gravada');
select is(pg_temp.efetivo('tolerancia_da_ausencia_min', 'retorno', '00000000-0000-4000-8000-0000000000c1'),
          '15 servico', 'o Serviço vence o tipo de atendimento');
select is(pg_temp.efetivo('janela_de_confirmacao_h', 'retorno'), '72 sistema', 'os outros parâmetros seguem no padrão');
select lives_ok($$ select atta_in.set_setting('janela_de_confirmacao_h', '48') $$, 'janela de 48 h na unidade');
select lives_ok($$ select atta_in.set_setting('janela_de_confirmacao_h', '24') $$, 'gravar de novo altera a mesma linha');
select is(pg_temp.efetivo('janela_de_confirmacao_h'), '24 unidade', 'o valor novo vale');
select is((select count(*)::int from atta_in.setting where key = 'janela_de_confirmacao_h'), 1,
          'uma linha só por escopo');
select lives_ok($$ select atta_in.set_setting('fluxo_alternativo_habilitado', 'false') $$, 'booleano gravado');
select is(pg_temp.efetivo('fluxo_alternativo_habilitado'), 'false unidade', 'booleano lido');
select lives_ok($$ select atta_in.set_setting('janela_de_confirmacao_h', '720') $$, 'teto de 720 h aceito');

-- valores recusados: 422 ATTA-IN-0001, sem gravar --------------------------------------------------------------------
select throws_ok($$ select atta_in.set_setting('tolerancia_da_ausencia_min', '45') $$, 'P0001', 'ATTA-IN-0001',
                 'tolerância fora das opções do PDD');
select throws_ok($$ select atta_in.set_setting('janela_de_confirmacao_h', '721') $$, 'P0001', 'ATTA-IN-0001',
                 'janela acima do teto de 720 h');
select throws_ok($$ select atta_in.set_setting('janela_de_confirmacao_h', '0') $$, 'P0001', 'ATTA-IN-0001',
                 'janela abaixo de 1 h');
select throws_ok($$ select atta_in.set_setting('janela_de_confirmacao_h', 'true') $$, 'P0001', 'ATTA-IN-0001',
                 'booleano onde se espera número');
select throws_ok($$ select atta_in.set_setting('fluxo_alternativo_habilitado', '1') $$, 'P0001', 'ATTA-IN-0001',
                 'número onde se espera booleano');
select throws_ok($$ select atta_in.set_setting('janela_de_confirmacao_h', '"72"') $$, 'P0001', 'ATTA-IN-0001',
                 'texto "72" não vira número');
select throws_ok($$ select atta_in.set_setting('janela_de_confirmacao_h', '72.5') $$, 'P0001', 'ATTA-IN-0001',
                 'decimal recusado');
select throws_ok($$ select atta_in.set_setting('janela_de_confirmacao_h', 'null') $$, 'P0001', 'ATTA-IN-0001',
                 'null recusado');
select throws_ok($$ select atta_in.set_setting('janela_de_confirmacao_h', '24', 'consulta',
                    '00000000-0000-4000-8000-0000000000c1') $$, 'P0001', 'ATTA-IN-0001',
                 'tipo de atendimento e Serviço juntos são recusados');
select throws_ok($$ select atta_in.set_setting('janela_de_confirmacao_h', '24', 'tratamento') $$, 'P0001',
                 'ATTA-IN-0001', 'Tratamento não é tipo de atendimento');
select throws_ok($$ select atta_in.set_setting('expediente_da_clinica', '8') $$, 'P0002', 'ATTA-CORE-0005',
                 'parâmetro fora do catálogo é 404');
select throws_ok($$ insert into atta_in.setting (tenant_id, key, level, value_int)
                    values ('00000000-0000-4000-8000-00000000000a', 'janela_de_confirmacao_h', 'unidade', 9999)
                    on conflict do nothing $$,
                 'P0001', 'ATTA-IN-0001', 'insert direto também respeita o catálogo (gatilho)');

-- Pronto quando 4: uma clínica não vê nem altera a configuração de outra ----------------------------------------------
select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'ADMIN');
select is(pg_temp.efetivo('tolerancia_da_ausencia_min', 'retorno'), '120 sistema',
          'passo 4: a clínica B não vê a exceção da A');
select is((select count(*)::int from atta_in.setting), 0, 'passo 4: a clínica B não lê nenhuma linha da A');
select is(pg_temp.alterar_da_a(), 0, 'passo 4: a clínica B não altera linha da A');
select throws_ok($$ insert into atta_in.setting (tenant_id, key, level, value_int)
                    values ('00000000-0000-4000-8000-00000000000a', 'janela_de_confirmacao_h', 'unidade', 12) $$,
                 '42501', null, 'passo 4: a clínica B não grava em nome da A');

-- Colaborador e quem não tem clínica no token não chegam à configuração ----------------------------------------------
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'COLABORADOR');
select throws_ok($$ select * from atta_in.effective_settings() $$, '42501', 'ATTA-AUTH-0004',
                 'Colaborador não lê Configurações');
select is((select count(*)::int from atta_in.setting), 0, 'Colaborador não lê linha nenhuma, nem direto');
select pg_temp.entrar(null, 'ADMIN');
select throws_ok($$ select * from atta_in.effective_settings() $$, '42501', 'ATTA-AUTH-0004',
                 'sem clínica no token, nada (falha fechada)');

-- vínculo removido com o token ainda válido: nada (ADR 0001 §2)
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select pg_temp.remover_vinculo();
select throws_ok($$ select * from atta_in.effective_settings() $$, '42501', 'ATTA-AUTH-0004',
                 'vínculo removido: o ADMIN com token válido não lê Configurações');
select is((select count(*)::int from atta_in.setting), 0, 'vínculo removido: nenhuma linha, nem direto');

select pg_temp.sair();
select * from finish();
rollback;
