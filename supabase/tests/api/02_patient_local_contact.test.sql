-- MIG-12 (c): contato local do vínculo em acesso pendente à rede (dados fictícios: bytes inventados, nomes inventados).
begin;
select plan(19);

insert into platform.tenant (id, name) values
  ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A'),
  ('00000000-0000-4000-8000-00000000000b', 'Clínica Fictícia B'),
  ('00000000-0000-4000-8000-00000000000c', 'Clínica Fictícia C');

create function pg_temp.entrar(p_tenant uuid, p_role text) returns void language plpgsql as $$
declare
  v_user uuid := gen_random_uuid();
begin
  -- usuário fictício com vínculo ativo na clínica: o has_permission do MIG-02 confere o vínculo no banco
  perform set_config('role', 'postgres', true);
  insert into auth.users (id, email) values (v_user, v_user::text || '@teste.invalid');
  if p_tenant is not null and p_role in ('ADMIN', 'COLABORADOR') then
    insert into platform.membership (tenant_id, user_id, app_role) values (p_tenant, v_user, p_role);
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'tenant_id', p_tenant, 'app_role', p_role,
                      -- ADMIN só com o 2º fator no token (MIG-03)
                      'aal', case when p_role = 'ADMIN' then 'aal2' else 'aal1' end)::text, true);
end $$;

-- cadastro com o contato da rede e, à parte, o contato local já cifrado com o envelope do vínculo
create function pg_temp.cadastrar(p_id uuid, p_nome text, p_cpf text, p_phone bytea, p_env uuid default null,
                                  p_local_phone bytea default null) returns boolean language sql as $$
  select reused from api.patient_register(p_id, p_nome, null, date '1990-05-10', sha256(p_cpf::bytea),
    '***.***.***-' || right(p_cpf, 2), '\x01aa', p_phone_enc => p_phone, p_dek_wrapped => '\x01cc',
    p_kek_version => 1::smallint, p_local_envelope_id => p_env, p_local_phone_enc => p_local_phone,
    p_local_dek_wrapped => case when p_env is not null then '\x01dd'::bytea end,
    p_local_kek_version => case when p_env is not null then 1::smallint end)
$$;
create function pg_temp.fone_na_rede(p_id uuid) returns bytea language sql security definer as $$
  select phone_enc from network.person where id = p_id
$$;
create function pg_temp.vinculo_local(p_tenant uuid, p_id uuid) returns text language sql security definer as $$
  select concat_ws('|', local_envelope_id, local_phone_enc, local_dek_wrapped) from network.person_tenant_link
  where tenant_id = p_tenant and person_id = p_id
$$;
create function pg_temp.trilha_local(p_depois bytea) returns text language sql security definer as $$
  select before::text || '|' || after::text from audit.event
  where action = 'patient.update' and after ->> 'local_phone_enc' = encode(p_depois, 'base64')
$$;

do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated',
                 pg_my_temp_schema()::regnamespace);
end $$;

-- A cria a pessoa: o contato local mandado junto é descartado em owner
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select is(pg_temp.cadastrar('00000000-0000-4000-8000-0000000000e1', 'Marina Teste Fictícia', 'cpf-ficticio-c1', '\x01a1', gen_random_uuid(), '\x01a9'),
          false, 'A cria a pessoa');
select is(pg_temp.vinculo_local('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000e1'), '', 'owner: o contato local mandado no register é descartado');
select ok((select phone_enc = '\x01a1' and dek_wrapped = '\x01cc' and envelope_id = '00000000-0000-4000-8000-0000000000e1' and network_access = 'owner'
           from api.patient_get('00000000-0000-4000-8000-0000000000e1')), 'owner: contato e envelope da rede, com o id da pessoa para o AAD');

-- B reaproveita pelo CPF numa chamada só, com o contato local cifrado antes de saber que a pessoa existia
select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'COLABORADOR');
select throws_ok($$ select pg_temp.cadastrar(gen_random_uuid(), 'Marina Digitada Pela B', 'cpf-ficticio-c1', '\x01b1',
                                            null, '\x01b2') $$,
                 'P0001', 'ATTA-IN-0001', 'contato local sem o envelope local é recusado');
select is(pg_temp.cadastrar(gen_random_uuid(), 'Marina Digitada Pela B', 'cpf-ficticio-c1', '\x01b1', '00000000-0000-4000-8000-0000000000f1', '\x01b2'),
          true, 'B reaproveita a pessoa e grava o contato local na mesma chamada');
select ok((select phone_enc = '\x01b2' and dek_wrapped = '\x01dd' and kek_version = 1 and envelope_id = '00000000-0000-4000-8000-0000000000f1'
                  and network_access = 'pending' from api.patient_get('00000000-0000-4000-8000-0000000000e1')),
          'pending: get devolve o contato e o envelope locais, com o local_envelope_id para o AAD');
select ok((select phone_enc = '\x01b2' and envelope_id = '00000000-0000-4000-8000-0000000000f1' from api.patient_list() where person_id = '00000000-0000-4000-8000-0000000000e1'),
          'pending: list devolve o contato local');
select is(pg_temp.fone_na_rede('00000000-0000-4000-8000-0000000000e1'), '\x01a1'::bytea, 'o contato da rede não muda');

-- B troca o contato local com o envelope que já existe; o envelope não é trocado
select lives_ok($$ select api.patient_update('00000000-0000-4000-8000-0000000000e1', 'novo contato', p_phone_enc => '\x01b3') $$,
                'pending: B troca o contato local com o mesmo envelope');
select is(pg_temp.trilha_local('\x01b3'), '{"local_phone_enc": "AbI="}|{"local_phone_enc": "AbM="}',
          'a trilha guarda o antes e o depois do contato local em base64 (ADR 0003)');
select throws_ok($$ select api.patient_update('00000000-0000-4000-8000-0000000000e1', 'outro envelope', p_phone_enc => '\x01b4',
                    p_local_envelope_id => gen_random_uuid(), p_local_dek_wrapped => '\x01ee',
                    p_local_kek_version => 2::smallint) $$,
                 'P0001', 'ATTA-IN-0001', 'pending: o envelope local não é trocado depois de criado');

-- C reaproveita sem contato; depois cria o envelope local no primeiro contato
select pg_temp.entrar('00000000-0000-4000-8000-00000000000c', 'ADMIN');
select is(pg_temp.cadastrar(gen_random_uuid(), 'Marina Digitada Pela C', 'cpf-ficticio-c1', '\x01c1'), true,
          'C reaproveita sem contato local');
select throws_ok($$ select api.patient_update('00000000-0000-4000-8000-0000000000e1', 'contato informado', p_phone_enc => '\x01c2') $$,
                 'P0001', 'ATTA-IN-0001', 'pending sem envelope: contato sem envelope local é recusado');
select throws_ok($$ select api.patient_update('00000000-0000-4000-8000-0000000000e1', 'só o envelope', p_local_envelope_id => '00000000-0000-4000-8000-0000000000f2',
                    p_local_dek_wrapped => '\x01ee', p_local_kek_version => 1::smallint) $$,
                 'P0001', 'ATTA-IN-0001', 'envelope local sem contato é recusado');
select lives_ok($$ select api.patient_update('00000000-0000-4000-8000-0000000000e1', 'contato informado', p_phone_enc => '\x01c2',
                   p_local_envelope_id => '00000000-0000-4000-8000-0000000000f2', p_local_dek_wrapped => '\x01ee',
                   p_local_kek_version => 1::smallint) $$, 'pending: C cria o envelope local com o primeiro contato');
select is(pg_temp.vinculo_local('00000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-0000000000e1'), '00000000-0000-4000-8000-0000000000f2|\x01c2|\x01ee', 'o vínculo da C guarda o contato e o envelope dela');
select is(pg_temp.vinculo_local('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000e1'), '00000000-0000-4000-8000-0000000000f1|\x01b3|\x01dd', 'o vínculo da B não muda');

-- A, dona: nada de envelope local por aqui
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select throws_ok($$ select api.patient_update('00000000-0000-4000-8000-0000000000e1', 'envelope local', p_phone_enc => '\x01a2',
                    p_local_envelope_id => gen_random_uuid(), p_local_dek_wrapped => '\x01ff',
                    p_local_kek_version => 1::smallint) $$,
                 'P0001', 'ATTA-IN-0001', 'owner não grava envelope local');
select ok((select phone_enc = '\x01a1' from api.patient_get('00000000-0000-4000-8000-0000000000e1')), 'A segue lendo o contato da rede');

select * from finish();
rollback;
