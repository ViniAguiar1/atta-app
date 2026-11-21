-- MIG-12d: CPF já na rede no Novo paciente (PDD §10.1): consulta e vínculo pelo HMAC, auditoria e limite. Dados fictícios.
begin;
select plan(26);

insert into platform.tenant (id, name) values
  ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A'),
  ('00000000-0000-4000-8000-00000000000b', 'Clínica Fictícia B'),
  ('00000000-0000-4000-8000-00000000000c', 'Clínica Fictícia C');

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

create function pg_temp.verificar_na_rede(p_person uuid) returns void language sql security definer as $$
  insert into network.identity_verification (person_id, verified_at, expires_at, proof_hash, result)
  values (p_person, now(), now() + interval '6 months', sha256('prova'::bytea), 'aprovada')
$$;
create function pg_temp.eventos(p_action text, p_tenant uuid) returns int language sql security definer as $$
  select count(*)::int from audit.event where action = p_action and tenant_id = p_tenant
$$;
create function pg_temp.lotar_clinica(p_tenant uuid) returns void language sql security definer as $$
  insert into private.rate_limit_counter (bucket, key_hash, window_start, hits)
  values ('patient.cpf.tenant', extensions.digest('atta.ratelimit.v1|patient.cpf.tenant|' || p_tenant::text, 'sha256'),
          to_timestamp(floor(extract(epoch from clock_timestamp()) / 86400) * 86400), 300)
  on conflict (bucket, key_hash, window_start) do update set hits = 300
$$;
create function pg_temp.acesso(p_tenant uuid) returns text language sql security definer as $$
  select network_access from network.person_tenant_link where tenant_id = p_tenant
$$;
create function pg_temp.nome_local(p_tenant uuid) returns text language sql security definer as $$
  select local_full_name from network.person_tenant_link where tenant_id = p_tenant
$$;

do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated', pg_my_temp_schema()::regnamespace);
end $$;

-- a Clínica A cadastra a pessoa (dona do dado de rede) e ela tem o selo de verificação
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select api.patient_register('00000000-0000-4000-8000-0000000000e1', 'Marina Teste Fictícia', 'Mari Fictícia',
  date '1990-05-10', sha256('52998224725'::bytea), '···.···.247-25', '\x01aa'::bytea,
  p_phone_enc => '\x01bb', p_email_enc => '\x01bc', p_dek_wrapped => '\x01cc', p_kek_version => 1::smallint);
select pg_temp.verificar_na_rede('00000000-0000-4000-8000-0000000000e1');

select is(api.patient_lookup_by_cpf(sha256('52998224725'::bytea)) ->> 'status', 'ja_paciente',
          'na própria clínica: já é paciente');
select is(api.patient_lookup_by_cpf(sha256('52998224725'::bytea)) ->> 'person_id',
          '00000000-0000-4000-8000-0000000000e1', 'já é paciente: devolve o id para abrir a Pasta');
select ok(api.patient_lookup_by_cpf(sha256('52998224725'::bytea)) -> 'card' = 'null'::jsonb,
          'já é paciente: sem cartão (a Pasta usa o patient_get, com a regra de cada acesso)');

-- a Clínica B consulta o mesmo CPF
select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'COLABORADOR');
select is(api.patient_lookup_by_cpf(sha256('11144477735'::bytea)), '{"status": "nao_encontrado", "person_id": null, "card": null}'::jsonb,
          'CPF novo: nao_encontrado, sem nada da rede');
select is(api.patient_lookup_by_cpf(sha256('52998224725'::bytea)) ->> 'status', 'na_rede', 'CPF de outra clínica: na_rede');
select results_eq(
  $$ select c ->> 'person_id', c ->> 'full_name', c ->> 'social_name', c ->> 'birth_date', c ->> 'cpf_masked',
            (c ->> 'is_verified')::boolean, c ->> 'verified_until' is not null
     from (select api.patient_lookup_by_cpf(sha256('52998224725'::bytea)) -> 'card' c) x $$,
  $$ values ('00000000-0000-4000-8000-0000000000e1'::text, 'Marina Teste Fictícia'::text, 'Mari Fictícia'::text,
             '1990-05-10'::text, '···.···.247-25'::text, true, true) $$,
  'o cartão traz nome, nome social, nascimento, CPF mascarado e o selo da rede');
select results_eq(
  $$ select c ->> 'phone_enc', c ->> 'email_enc', c ->> 'envelope_id', c ->> 'dek_wrapped', (c ->> 'kek_version')::int
     from (select api.patient_lookup_by_cpf(sha256('52998224725'::bytea)) -> 'card' c) x $$,
  $$ values ('\x01bb'::text, '\x01bc'::text, '00000000-0000-4000-8000-0000000000e1'::text, '\x01cc'::text, 1) $$,
  'contato cifrado com o envelope_id (= id da pessoa) para a AAD da ADR 0002 §6');
select is((api.patient_lookup_by_cpf(sha256('52998224725'::bytea)) -> 'card' ->> 'health_forms_count')::int, 0,
          'saúde: só a contagem, sem conteúdo');
select ok(not (api.patient_lookup_by_cpf(sha256('52998224725'::bytea)) -> 'card' ?| array['cpf_enc', 'cpf_hmac']),
          'nem o CPF cifrado nem o HMAC saem no cartão');
select is(pg_temp.eventos('patient.lookup', '00000000-0000-4000-8000-00000000000b'), 6,
          'cada consulta vai para a auditoria da clínica que consultou');
select is((select count(*)::int from api.patient_list()), 0, 'consultar não vincula');

select throws_ok($$ select api.patient_lookup_by_cpf('\x01'::bytea) $$, 'P0001', 'ATTA-IN-0001',
                 'HMAC fora do tamanho: recusado');

-- confirmar e vincular
select is(api.patient_link_by_cpf(sha256('52998224725'::bytea)),
          '{"status": "vinculado", "person_id": "00000000-0000-4000-8000-0000000000e1", "network_access": "granted"}'::jsonb,
          'confirmar vincula com network_access = granted');
select results_eq($$ select person_id, display_name, network_access, phone_enc, is_verified from api.patient_list() $$,
                  $$ values ('00000000-0000-4000-8000-0000000000e1'::uuid, 'Mari Fictícia'::text, 'granted'::text,
                             '\x01bb'::bytea, true) $$,
                  'na B, o paciente aparece com o dado da rede, o contato e o selo, sem redigitar');
select is(pg_temp.nome_local('00000000-0000-4000-8000-00000000000b'), null, 'sem campos locais');
select is(pg_temp.eventos('patient.link', '00000000-0000-4000-8000-00000000000b'), 1, 'o vínculo vai para a auditoria');
select is(api.patient_link_by_cpf(sha256('52998224725'::bytea)) ->> 'status', 'ja_paciente',
          'vincular de novo: status ja_paciente, sem raise (a tentativa conta no limite)');
select is(api.patient_link_by_cpf(sha256('11144477735'::bytea)),
          '{"status": "nao_encontrado", "person_id": null, "network_access": null}'::jsonb,
          'CPF que não está na rede: status nao_encontrado, sem raise');

-- clínica com vínculo pending (o register de hoje ainda cria pending; depois, só após uma revogação): não recebe o
-- cartão da rede nem volta a granted pelo vínculo (Segurança, revisão do #150)
select pg_temp.entrar('00000000-0000-4000-8000-00000000000c', 'ADMIN');
select api.patient_register(gen_random_uuid(), 'Nome Local da C', null, date '2001-01-01',
  sha256('52998224725'::bytea), '···.···.247-25', '\x01aa'::bytea,
  p_phone_enc => '\x01ff', p_dek_wrapped => '\x01cc', p_kek_version => 1::smallint);
select ok((select r ->> 'status' = 'ja_paciente' and r -> 'card' = 'null'::jsonb
           from (select api.patient_lookup_by_cpf(sha256('52998224725'::bytea)) r) x),
          'pending: a consulta diz ja_paciente e não traz o cartão da rede');
select is(api.patient_link_by_cpf(sha256('52998224725'::bytea)) ->> 'status', 'ja_paciente', 'pending: o vínculo não muda nada');
select is(pg_temp.acesso('00000000-0000-4000-8000-00000000000c'), 'pending', 'pending continua pending (não vira granted)');

-- sem clínica no token: recusado
select pg_temp.entrar(null, null);
select throws_ok($$ select api.patient_lookup_by_cpf(sha256('52998224725'::bytea)) $$, '42501', 'ATTA-AUTH-0004',
                 'sem clínica: consulta recusada');
select throws_ok($$ select api.patient_link_by_cpf(sha256('52998224725'::bytea)) $$, '42501', 'ATTA-AUTH-0004',
                 'sem clínica: vínculo recusado');

-- limite por usuário: 30 por hora; a 31ª devolve 54000 (LIMITE no servidor)
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'COLABORADOR');
do $$ begin
  for i in 1..30 loop perform api.patient_lookup_by_cpf(sha256(('cpf-' || i)::bytea)); end loop;
end $$;
select throws_ok($$ select api.patient_lookup_by_cpf(sha256('52998224725'::bytea)) $$, '54000', 'ATTA-IN-0003',
                 'passou de 30 por hora por usuário: LIMITE');

-- o vínculo também conta: 30 vínculos com CPF que não existe esgotam o balde do usuário (sem raise, nada se desfaz)
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
do $$ begin
  for i in 1..30 loop perform api.patient_link_by_cpf(sha256(('inexistente-' || i)::bytea)); end loop;
end $$;
select throws_ok($$ select api.patient_link_by_cpf(sha256('inexistente-31'::bytea)) $$, '54000', 'ATTA-IN-0003',
                 'o 31º vínculo com CPF inexistente: LIMITE (o vínculo não é oráculo sem limite)');

-- limite por clínica: 300 por dia, vale para qualquer usuário da clínica
select pg_temp.lotar_clinica('00000000-0000-4000-8000-00000000000b');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'ADMIN');
select throws_ok($$ select api.patient_link_by_cpf(sha256('52998224725'::bytea)) $$, '54000', 'ATTA-IN-0003',
                 'clínica com 300 no dia: LIMITE também para outro usuário e no vínculo');

select * from finish();
rollback;
