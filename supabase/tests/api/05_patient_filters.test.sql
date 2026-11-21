-- MIG-12: filtros e contadores da lista de Pacientes (captura 11) e o selo vencido ("Selo expirado"). Dados fictícios.
begin;
select plan(27);

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

create function pg_temp.cadastrar(p_id uuid, p_nome text, p_cpf text) returns boolean language sql as $$
  select reused from api.patient_register(p_id, p_nome, null, date '1990-05-10', sha256(p_cpf::bytea),
    '···.···.' || right(p_cpf, 6), '\x01aa'::bytea, p_phone_enc => '\x01bb', p_dek_wrapped => '\x01cc',
    p_kek_version => 1::smallint)
$$;
create function pg_temp.selo(p_person uuid, p_vence timestamptz) returns void language sql security definer as $$
  insert into network.identity_verification (person_id, verified_at, expires_at, proof_hash, result)
  values (p_person, p_vence - interval '6 months', p_vence, sha256(p_person::text::bytea), 'aprovada')
$$;
-- profissional fictício com o PROpass concluído e um agendamento do paciente (desvio a partir de agora)
create function pg_temp.profissional() returns void language sql security definer as $$
  insert into platform.professional (id, display_name, council, council_uf, council_number, cpf_hmac, cpf_masked,
                                     cpf_enc, email_enc, dek_wrapped, kek_version)
  values ('00000000-0000-4000-8000-0000000000d1', 'Dra. Fictícia', 'crm', 'SP', '999', sha256('prof'::bytea),
          '···.···.000-00', '\x01', '\x01', '\x01', 1);
  insert into platform.professional_tenant_link (id, tenant_id, professional_id, invite_email_hmac, invite_email_enc,
                                                 envelope_id, dek_wrapped, kek_version, propass_completed_at,
                                                 privacy_notice_version, privacy_notice_ack_at)
  values ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-00000000000a',
          '00000000-0000-4000-8000-0000000000d1', sha256('convite'::bytea), '\x01', gen_random_uuid(), '\x01', 1,
          now(), 'v1', now())
$$;
create function pg_temp.agendar(p_id uuid, p_person uuid, p_inicio timestamptz) returns void language sql security definer as $$
  insert into atta_in.appointment (id, tenant_id, person_id, professional_link_id, appointment_type, starts_at, ends_at)
  values (p_id, '00000000-0000-4000-8000-00000000000a', p_person, '00000000-0000-4000-8000-0000000000d2', 'consulta',
          p_inicio, p_inicio + interval '30 minutes')
$$;
create function pg_temp.eventos(p_action text) returns int language sql security definer as $$
  select count(*)::int from audit.event where action = p_action and tenant_id = '00000000-0000-4000-8000-00000000000a'
$$;
create function pg_temp.iniciar(p_id uuid) returns void language sql security definer as $$
  select atta_in.apply_transition(p_id, '00000000-0000-4000-8000-00000000000a', 'em_preenchimento')
$$;
create function pg_temp.cancelar(p_id uuid) returns void language sql security definer as $$
  select atta_in.apply_transition(p_id, '00000000-0000-4000-8000-00000000000a', 'cancelado', 'cancelado_pelo_paciente')
$$;
-- meio-dia de hoje e de ontem no fuso da clínica: o "hoje" não depende da hora em que o teste roda
create function pg_temp.meio_dia(p_dias int) returns timestamptz language sql as $$
  select ((now() at time zone t.timezone)::date + p_dias + time '12:00') at time zone t.timezone
  from platform.tenant t where t.id = '00000000-0000-4000-8000-00000000000a'
$$;

do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated', pg_my_temp_schema()::regnamespace);
end $$;

-- a B cria a Carla; a A cria Ana e Bruno e cadastra a Carla pelo mesmo CPF (pending: cadastrada em outra clínica)
select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'ADMIN');
select pg_temp.cadastrar('00000000-0000-4000-8000-0000000000e3', 'Carla Fictícia', '39053344705');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select pg_temp.cadastrar('00000000-0000-4000-8000-0000000000e1', 'Ana Fictícia', '52998224725');
select pg_temp.cadastrar('00000000-0000-4000-8000-0000000000e2', 'Bruno Fictício', '11144477735');
select pg_temp.cadastrar(gen_random_uuid(), 'Carla Local', '39053344705');

select pg_temp.selo('00000000-0000-4000-8000-0000000000e1', now() + interval '3 months');   -- Ana: selo válido
select pg_temp.selo('00000000-0000-4000-8000-0000000000e2', now() - interval '1 day');      -- Bruno: venceu
select pg_temp.selo('00000000-0000-4000-8000-0000000000e3', now() + interval '3 months');   -- Carla: válido na rede

select pg_temp.profissional();
select pg_temp.agendar('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1', pg_temp.meio_dia(0));
select pg_temp.agendar('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000e2', pg_temp.meio_dia(0));
select pg_temp.cancelar('00000000-0000-4000-8000-0000000000a2');                                 -- cancelado não conta
select pg_temp.agendar('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000e2', pg_temp.meio_dia(-1));  -- ontem não conta

select results_eq($$ select distinct total_active, count_other_clinic, count_today, count_archived from api.patient_list() $$,
                  $$ values (3, 1, 1, 0) $$,
                  'contadores: 3 ativos, 1 de outra clínica, 1 com atendimento hoje (sem cancelado nem ontem), 0 arquivados');
select results_eq($$ select display_name from api.patient_list(p_filter => 'outra_clinica') $$,
                  $$ values ('Carla Local'::text) $$, 'filtro "Cadastrados em outra clínica": quem a clínica não criou');
select results_eq($$ select display_name from api.patient_list(p_filter => 'atendimento_hoje') $$,
                  $$ values ('Ana Fictícia'::text) $$, 'filtro "Com atendimento hoje"');
select is((select count(*)::int from api.patient_list(p_filter => 'arquivados')), 0,
          'filtro "Arquivados" já no contrato, vazio até a regra de arquivar');
select results_eq($$ select distinct total_active, count_other_clinic, count_today
                     from api.patient_list(p_filter => 'outra_clinica') $$,
                  $$ values (3, 1, 1) $$, 'com filtro, os contadores continuam os da clínica inteira');
select throws_ok($$ select * from api.patient_list(p_filter => 'todos') $$, 'P0001', 'ATTA-IN-0001',
                 'filtro fora da lista: recusado');

select results_eq($$ select display_name from api.patient_search(p_name => 'Fictíci', p_filter => 'atendimento_hoje') $$,
                  $$ values ('Ana Fictícia'::text) $$, 'a busca aceita o mesmo filtro');
select results_eq($$ select distinct count_other_clinic, count_today from api.patient_search(p_name => 'Bruno') $$,
                  $$ values (1, 1) $$, 'a busca traz os mesmos contadores');
select throws_ok($$ select * from api.patient_search(p_name => 'Ana', p_filter => 'x') $$, 'P0001', 'ATTA-IN-0001',
                 'busca com filtro fora da lista: recusada');

select ok((select is_verified and verified_until > now() from api.patient_list() where display_name = 'Ana Fictícia'),
          'selo válido: is_verified e a validade');
select ok((select not is_verified and verified_until < now() from api.patient_list() where display_name = 'Bruno Fictício'),
          'selo vencido: is_verified falso e a data em que venceu ("Selo expirado")');
select ok((select not is_verified and verified_until is null from api.patient_list() where display_name = 'Carla Local'),
          'pending: nada da rede, nem o selo');
select ok((select not is_verified and verified_until is null
           from api.patient_search(p_doc_hmac => sha256('39053344705'::bytea))),
          'pending na busca por CPF: nada da rede');

-- R26: não arquiva com agendamento em aberto (Agendado futuro ou atendimento começado); o Agendado vencido não trava
select pg_temp.agendar('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000e1', now() + interval '2 days');
select throws_ok($$ select api.patient_set_archived('00000000-0000-4000-8000-0000000000e1', true) $$, 'P0001',
                 'ATTA-IN-0003', 'com Agendado futuro: não arquiva (cancele ou conclua antes)');
select pg_temp.cancelar('00000000-0000-4000-8000-0000000000a4');
select pg_temp.iniciar('00000000-0000-4000-8000-0000000000a1');
select throws_ok($$ select api.patient_set_archived('00000000-0000-4000-8000-0000000000e1', true) $$, 'P0001',
                 'ATTA-IN-0003', 'com atendimento já começado (Em preenchimento): não arquiva');
select ok((select count(*) = 0 from api.patient_list(p_filter => 'arquivados')),
          'nada foi arquivado nas recusas (o Bruno, abaixo, arquiva com um Agendado de ontem: vencido não trava)');

-- arquivar (decisão do dono, R26): só o gestor, só nesta clínica, some da lista padrão e não é agendado
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'COLABORADOR');
select throws_ok($$ select api.patient_set_archived('00000000-0000-4000-8000-0000000000e2', true) $$, '42501',
                 'ATTA-AUTH-0004', 'o Colaborador não arquiva');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select is(api.patient_set_archived('00000000-0000-4000-8000-0000000000e2', true) ->> 'archived', 'true', 'o gestor arquiva');
select results_eq($$ select distinct total_active, count_archived from api.patient_list() $$, $$ values (2, 1) $$,
                  'o arquivado sai do total de ativos e entra no contador de arquivados');
select results_eq($$ select display_name from api.patient_list(p_filter => 'arquivados') $$,
                  $$ values ('Bruno Fictício'::text) $$, 'filtro "Arquivados" mostra quem foi arquivado');
select is((select count(*)::int from api.patient_search(p_name => 'Bruno')), 0, 'a busca padrão não traz o arquivado');
select ok((select archived_at is not null from api.patient_get('00000000-0000-4000-8000-0000000000e2')),
          'a Pasta (patient_get) diz que está arquivado, para mostrar "Desarquivar"');
select throws_ok($$ select pg_temp.agendar(gen_random_uuid(), '00000000-0000-4000-8000-0000000000e2', pg_temp.meio_dia(1)) $$,
                 'P0001', 'ATTA-IN-0003', 'arquivado não é agendado até desarquivar');
select throws_ok($$ select api.patient_set_archived('00000000-0000-4000-8000-0000000000e2', true) $$, 'P0001',
                 'ATTA-IN-0003', 'arquivar de novo: recusado');
select api.patient_set_archived('00000000-0000-4000-8000-0000000000e2', false);
select ok((select archived_at is null from api.patient_get('00000000-0000-4000-8000-0000000000e2')),
          'desarquivado: a Pasta volta a mostrar "Arquivar"');
select ok((select not is_verified and verified_until < now() from api.patient_get('00000000-0000-4000-8000-0000000000e2')),
          'a Pasta também traz o selo vencido ("Selo expirado")');
select ok((select count(*) = 3 from api.patient_list())
          and pg_temp.eventos('patient.archive') = 1 and pg_temp.eventos('patient.unarchive') = 1,
          'desarquivar devolve à lista; arquivar e desarquivar vão para a trilha');

select * from finish();
rollback;
