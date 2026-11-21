-- MIG-23 (parte 2): sessão do Boarding Check, abrir e concluir (PDD §10.2.3, §13.4; ADR 0004 §3). Só dado fictício:
-- nomes inventados, hashes de texto inventado. Horários fixos no dia da clínica, para passar a qualquer hora.
begin;
select plan(26);

insert into platform.tenant (id, name) values ('00000000-0000-4000-8000-0000000024a0', 'Clínica Fictícia Sessão');
insert into network.person (id, full_name, social_name, birth_date, cpf_hmac, cpf_masked, cpf_enc, dek_wrapped, kek_version)
values ('00000000-0000-4000-8000-0000000024e1', 'Paciente Civil Fictícia', 'Paciente Social Fictícia',
        ((now() at time zone 'America/Sao_Paulo')::date - interval '34 years')::date,
        sha256('cpf-24e1'::bytea), '···.···.247-25', '\x01', '\x01', 1);
insert into network.person_tenant_link (tenant_id, person_id)
values ('00000000-0000-4000-8000-0000000024a0', '00000000-0000-4000-8000-0000000024e1');
insert into platform.professional (id, display_name, council, council_uf, council_number, cpf_hmac, cpf_masked, cpf_enc,
                                   email_enc, dek_wrapped, kek_version, council_status, council_verified_at)
values ('00000000-0000-4000-8000-0000000024f1', 'Dra. Fictícia Sessão', 'cro', 'SP', '24001', sha256('cpf-24f1'::bytea),
        '···.···.000-01', '\x01', '\x01', '\x01', 1, 'regularizado', now());   -- só regularizado recebe agenda (#282)
insert into platform.professional_tenant_link (id, tenant_id, professional_id, invite_email_hmac, invite_email_enc,
                                               envelope_id, dek_wrapped, kek_version, propass_completed_at)
values ('00000000-0000-4000-8000-0000000024d1', '00000000-0000-4000-8000-0000000024a0', '00000000-0000-4000-8000-0000000024f1',
        sha256('dra-sessao@a.test'::bytea), '\x01', gen_random_uuid(), '\x01', 1, now());

create function pg_temp.hora(p_dias int, p_hora int) returns timestamptz language sql as $$
  select (date_trunc('day', now() at time zone 'America/Sao_Paulo') + make_interval(days => p_dias, hours => p_hora))
         at time zone 'America/Sao_Paulo'
$$;
-- agenda em Agendado (as regras do insert valem) e põe o estado direto (o gatilho de validação não olha o status)
create function pg_temp.atendimento(p_id uuid, p_inicio timestamptz, p_status text) returns void language plpgsql as $$
begin
  insert into atta_in.appointment (id, tenant_id, person_id, professional_link_id, appointment_type, starts_at, ends_at)
  values (p_id, '00000000-0000-4000-8000-0000000024a0', '00000000-0000-4000-8000-0000000024e1',
          '00000000-0000-4000-8000-0000000024d1', 'consulta', p_inicio, p_inicio + interval '1 hour');
  if p_status <> 'agendado' then
    update atta_in.appointment set status = p_status where id = p_id;
  end if;
end $$;
-- sessão do Boarding Check (o PIN certo da parte 1 já trocou o link por ela)
create function pg_temp.sessao(p_segredo text, p_atendimento uuid, p_com_sessao boolean default true,
                               p_enviado interval default interval '5 minutes') returns void language sql as $$
  insert into platform.access_grant (purpose, tenant_id, professional_link_id, appointment_id, secret_hash, expires_at,
                                     sent_at, session_started_at)
  values ('professional_boarding', '00000000-0000-4000-8000-0000000024a0', '00000000-0000-4000-8000-0000000024d1',
          p_atendimento, sha256(p_segredo::bytea), now() + interval '8 hours', now() - p_enviado,
          case when p_com_sessao then now() end)
$$;
create function pg_temp.status(p_id uuid) returns text language sql as $$
  select status from atta_in.appointment where id = p_id
$$;
create function pg_temp.eventos(p_action text) returns int language sql as $$
  select count(*)::int from audit.event where action = p_action and tenant_id = '00000000-0000-4000-8000-0000000024a0'
$$;
do $$ begin
  execute format('grant execute on all functions in schema %I to service_role', pg_my_temp_schema()::regnamespace);
end $$;

-- o histórico: 2 concluídos e 1 ausente da mesma paciente
select pg_temp.atendimento('00000000-0000-4000-8000-000000002401', pg_temp.hora(-21, 10), 'concluido');
select pg_temp.atendimento('00000000-0000-4000-8000-000000002402', pg_temp.hora(-14, 10), 'ausente');
select pg_temp.atendimento('00000000-0000-4000-8000-000000002403', pg_temp.hora(-7, 10), 'concluido');
-- hoje: um Pronto (o do Boarding Check) e um ainda Agendado
select pg_temp.atendimento('00000000-0000-4000-8000-000000002410', pg_temp.hora(0, 10), 'pronto');
select pg_temp.atendimento('00000000-0000-4000-8000-000000002411', pg_temp.hora(0, 11), 'agendado');
select pg_temp.sessao('sessao-1', '00000000-0000-4000-8000-000000002410');
select pg_temp.sessao('link-1', '00000000-0000-4000-8000-000000002410', false);
select pg_temp.sessao('sessao-agendado', '00000000-0000-4000-8000-000000002411');
select pg_temp.sessao('sessao-vencida', '00000000-0000-4000-8000-000000002410', p_enviado => interval '8 hours 1 minute');

-- fechado: só o service_role
select ok(not has_function_privilege('anon', 'api.boarding_open(bytea)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'api.boarding_open(bytea)', 'EXECUTE')
          and not has_function_privilege('anon', 'api.boarding_complete(bytea)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'api.boarding_complete(bytea)', 'EXECUTE'),
          'anon e authenticated sem EXECUTE em boarding_open e boarding_complete');
select ok(has_function_privilege('service_role', 'api.boarding_open(bytea)', 'EXECUTE')
          and has_function_privilege('service_role', 'api.boarding_complete(bytea)', 'EXECUTE'),
          'service_role executa as duas');
select ok(not has_function_privilege('service_role', 'private.boarding_session(bytea, boolean)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'private.boarding_session(bytea, boolean)', 'EXECUTE'),
          'a resolução da sessão fica em private');
select is((select count(*)::int from information_schema.parameters
           where specific_schema = 'api' and (specific_name like 'boarding_open%' or specific_name like 'boarding_complete%')
             and parameter_mode = 'IN' and parameter_name <> 'p_session_hash'), 0,
          'só o hash da sessão entra: atendimento, clínica e profissional saem do grant');

set local role service_role;
-- sem sessão válida, nada abre (a mesma resposta)
select throws_ok($$ select * from api.boarding_open(sha256('link-1'::bytea)) $$, '42501', 'ATTA-AUTH-0004',
                 'o hash do link, antes do PIN, não abre');
select throws_ok($$ select * from api.boarding_open(sha256('sessao-desconhecida'::bytea)) $$, '42501', 'ATTA-AUTH-0004',
                 'sessão desconhecida não abre');
select throws_ok($$ select * from api.boarding_open(sha256('sessao-vencida'::bytea)) $$, '42501', 'ATTA-AUTH-0004',
                 'mais de 8 h do envio não abre');
select throws_ok($$ select * from api.boarding_open(null) $$, '42501', 'ATTA-AUTH-0004', 'sem hash não abre');

-- abrir: o resumo do topo e Pronto → Em atendimento
select results_eq(
  $$ select clinic_name, patient_name, patient_age, starts_at_local, appointment_type, attended_count, absent_count, status
     from api.boarding_open(sha256('sessao-1'::bytea)) $$,
  $$ values ('Clínica Fictícia Sessão'::text, 'Paciente Social Fictícia'::text, 34, '10:00'::text, 'consulta'::text, 2, 1,
            'em_atendimento'::text) $$,
  'resumo: clínica, nome social, idade no fuso da clínica, horário local, tipo e histórico (2 atendimentos, 1 ausência)');
reset role;
select is(pg_temp.status('00000000-0000-4000-8000-000000002410'), 'em_atendimento', 'a primeira abertura passa a Em atendimento');
select ok((select in_service_at is not null from atta_in.appointment where id = '00000000-0000-4000-8000-000000002410'),
          'com a hora do início do atendimento');
select is((select count(*)::int from atta_in.appointment_transition
           where appointment_id = '00000000-0000-4000-8000-000000002410' and from_status = 'pronto' and to_status = 'em_atendimento'),
          1, 'a transição fica registrada');
select is(pg_temp.eventos('boarding.open'), 1, 'a abertura vai para a trilha');
select is((select count(*)::int from audit.event where action = 'boarding.open'
             and tenant_id = '00000000-0000-4000-8000-0000000024a0' and entity_id = '00000000-0000-4000-8000-000000002410'
             and before is null and after is null), 1, 'na trilha, o atendimento, sem dado do paciente');

set local role service_role;
select is((select status from api.boarding_open(sha256('sessao-1'::bytea))), 'em_atendimento',
          'abrir de novo: continua Em atendimento');
reset role;
select is(pg_temp.eventos('boarding.open'), 2, 'cada abertura vai para a trilha');
select is((select count(*)::int from atta_in.appointment_transition
           where appointment_id = '00000000-0000-4000-8000-000000002410'), 1, 'sem transição repetida');

-- estados que não abrem nem concluem
set local role service_role;
select throws_ok($$ select * from api.boarding_open(sha256('sessao-agendado'::bytea)) $$, 'P0001', 'ATTA-IN-0003',
                 'atendimento ainda Agendado: não abre');
select throws_ok($$ select api.boarding_complete(sha256('sessao-agendado'::bytea)) $$, 'P0001', 'ATTA-IN-0003',
                 'concluir só de Em atendimento');
select throws_ok($$ select api.boarding_complete(sha256('link-1'::bytea)) $$, '42501', 'ATTA-AUTH-0004',
                 'concluir pelo hash do link: recusado');

-- concluir: Concluído e o link revogado na mesma transação
select ok(api.boarding_complete(sha256('sessao-1'::bytea)) ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$',
          'concluir devolve a hora em ISO UTC');
reset role;
select is(pg_temp.status('00000000-0000-4000-8000-000000002410'), 'concluido', 'o atendimento fica Concluído');
select ok((select bool_and(revoked_at is not null) from platform.access_grant
           where appointment_id = '00000000-0000-4000-8000-000000002410'),
          'todos os links do atendimento são revogados');
select ok((select not concluded_by_reception from atta_in.appointment where id = '00000000-0000-4000-8000-000000002410'),
          'concluído pelo profissional, não pela recepção');
set local role service_role;
select throws_ok($$ select * from api.boarding_open(sha256('sessao-1'::bytea)) $$, '42501', 'ATTA-AUTH-0004',
                 'depois de concluir, a sessão não abre mais');
select throws_ok($$ select api.boarding_complete(sha256('sessao-1'::bytea)) $$, '42501', 'ATTA-AUTH-0004',
                 'nem conclui de novo');
reset role;

select * from finish();
rollback;
