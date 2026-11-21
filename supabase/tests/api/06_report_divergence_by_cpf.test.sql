-- MIG-12: reporte de divergência pelo CPF antes do vínculo (PDD §10.1, RN-PAC-08), com limite e trilha. Dados fictícios.
begin;
select plan(10);

insert into platform.tenant (id, name) values
  ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A'),
  ('00000000-0000-4000-8000-00000000000b', 'Clínica Fictícia B');

create function pg_temp.entrar(p_tenant uuid, p_role text) returns void language plpgsql as $$
declare
  v_user uuid := gen_random_uuid();
begin
  perform set_config('role', 'postgres', true);
  insert into auth.users (id, email) values (v_user, v_user::text || '@teste.invalid');
  if p_tenant is not null and p_role in ('ADMIN', 'COLABORADOR') then
    insert into platform.membership (tenant_id, user_id, app_role) values (p_tenant, v_user, p_role);
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'tenant_id', p_tenant, 'app_role', p_role,
                      'aal', case when p_role = 'ADMIN' then 'aal2' else 'aal1' end,
                      'amr', json_build_array(json_build_object('method', 'password',
                                                                'timestamp', extract(epoch from now())::bigint)))::text, true);
end $$;
create function pg_temp.reportes(p_tenant uuid) returns table (person_id uuid, reason text)
language sql security definer as $$
  select person_id, reason from network.divergence_report where tenant_id = p_tenant order by created_at
$$;
create function pg_temp.eventos(p_tenant uuid) returns int language sql security definer as $$
  select count(*)::int from audit.event where action = 'patient.divergence' and tenant_id = p_tenant
$$;

do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated', pg_my_temp_schema()::regnamespace);
end $$;

-- a Clínica A cadastra a pessoa; a B consulta o CPF, vê dado que não confere e reporta sem vincular
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select api.patient_register('00000000-0000-4000-8000-0000000000e1', 'Marina Teste Fictícia', null, date '1990-05-10',
  sha256('52998224725'::bytea), '···.···.247-25', '\x01aa'::bytea, p_dek_wrapped => '\x01cc', p_kek_version => 1::smallint);

select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'COLABORADOR');
select is(api.report_divergence_by_cpf(sha256('52998224725'::bytea), 'nome_nao_confere'), '{"status": "recebido"}'::jsonb,
          'CPF na rede: reporte recebido, sem nada da pessoa');
select results_eq($$ select person_id, reason from pg_temp.reportes('00000000-0000-4000-8000-00000000000b') $$,
                  $$ values ('00000000-0000-4000-8000-0000000000e1'::uuid, 'nome_nao_confere'::text) $$,
                  'o reporte fica gravado para a pessoa da rede, com o motivo da lista');
select is(api.report_divergence_by_cpf(sha256('11144477735'::bytea), 'outro'), '{"status": "recebido"}'::jsonb,
          'CPF fora da rede: a mesma resposta (o reporte não é oráculo de existência)');
select is((select count(*)::int from pg_temp.reportes('00000000-0000-4000-8000-00000000000b')), 1,
          'CPF fora da rede não grava reporte');
select is(pg_temp.eventos('00000000-0000-4000-8000-00000000000b'), 2, 'as duas tentativas vão para a trilha');
select is((select count(*)::int from api.patient_list()), 0, 'reportar não vincula');
select throws_ok($$ select api.report_divergence_by_cpf(sha256('52998224725'::bytea), 'nome no WhatsApp diferente') $$,
                 'P0001', 'ATTA-IN-0001', 'motivo fora da lista fechada: recusado');
select throws_ok($$ select api.report_divergence_by_cpf('\x01'::bytea, 'outro') $$, 'P0001', 'ATTA-IN-0001',
                 'HMAC fora do tamanho: recusado');

select pg_temp.entrar(null, null);
select throws_ok($$ select api.report_divergence_by_cpf(sha256('52998224725'::bytea), 'outro') $$, '42501',
                 'ATTA-AUTH-0004', 'sem clínica: recusado');

-- o mesmo balde do lookup: 30 por hora por usuário, a 31ª dá 54000 (LIMITE)
select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'ADMIN');
do $$ begin
  for i in 1..30 loop perform api.report_divergence_by_cpf(sha256(('inexistente-' || i)::bytea), 'outro'); end loop;
end $$;
select throws_ok($$ select api.report_divergence_by_cpf(sha256('52998224725'::bytea), 'outro') $$, '54000',
                 'ATTA-IN-0003', 'a 31ª tentativa na hora: LIMITE');

select * from finish();
rollback;
