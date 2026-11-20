-- MIG-11b: agendamento, estados e regras (PDD v206 §10.2.1 e §10.2.2; ADR 0005 §4). Dados fictícios.
begin;
select plan(46);

insert into platform.tenant (id, name) values ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A'), ('00000000-0000-4000-8000-00000000000b', 'Clínica Fictícia B');
-- paciente da rede com vínculo na A e um provisório da importação da A
insert into network.person (id, full_name, is_incomplete) values ('00000000-0000-4000-8000-0000000000e1', 'Paciente Fictícia', true);
insert into network.person_tenant_link (tenant_id, person_id) values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000e1');
insert into network.person_import_provisional (id, tenant_id, import_batch_id, cpf_hmac, cpf_masked, cpf_enc, full_name,
                                               dek_wrapped, kek_version)
values ('00000000-0000-4000-8000-0000000000e9', '00000000-0000-4000-8000-00000000000a', gen_random_uuid(), sha256('cpf-prov'::bytea), '···.···.000-00',
        '\x01', 'Provisório Fictício', '\x01', 1);
-- profissional com PROpass (L1) e convite sem PROpass (L2)
insert into platform.professional (id, display_name, council, council_uf, council_number, cpf_hmac, cpf_masked, cpf_enc,
                                   email_enc, dek_wrapped, kek_version)
values ('00000000-0000-4000-8000-0000000000f1', 'Dra. Fictícia', 'cro', 'SP', '12345', sha256('cpf-prof'::bytea),
        '···.···.000-01', '\x01', '\x01', '\x01', 1);
insert into platform.professional_tenant_link (id, tenant_id, professional_id, invite_email_hmac, invite_email_enc,
                                               envelope_id, dek_wrapped, kek_version, propass_completed_at,
                                               privacy_notice_version, privacy_notice_ack_at)
values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000f1', sha256('dra@a.test'::bytea),
        '\x01', gen_random_uuid(), '\x01', 1, now(), 'v1', now()),
       ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-00000000000a', null, sha256('dr2@a.test'::bytea), '\x01', gen_random_uuid(),
        '\x01', 1, null, null, null);
insert into atta_in.clinic_service (id, tenant_id, name, duration_min) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000000a', 'Limpeza de Pele Fictícia', 60),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-00000000000a', 'Serviço Não Autorizado', 30);
insert into atta_in.professional_service (tenant_id, professional_link_id, clinic_service_id)
values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1');

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
                      'aal', case when p_role = 'ADMIN' then 'aal2' else 'aal1' end,
                      -- hora do login (sessão de 12 h, MIG-03 do Backend 1)
                      'amr', json_build_array(json_build_object('method', 'password',
                                                                'timestamp', extract(epoch from now())::bigint)))::text, true);
end $$;

create function pg_temp.remover_vinculo() returns void language plpgsql as $$
begin
  -- o vínculo sai do banco, mas o token continua válido (regra da ADR 0001 §2, revisão do MIG-02)
  perform set_config('role', 'postgres', true);
  update platform.membership set deleted_at = now()
  where user_id = (current_setting('request.jwt.claims')::jsonb ->> 'sub')::uuid;
  perform set_config('role', 'authenticated', true);
end $$;

-- meio-dia local de hoje (+ p_dias) no fuso da clínica
create function pg_temp.meio_dia(p_dias int default 0) returns timestamptz language sql as $$
  select (date_trunc('day', now() at time zone 'America/Sao_Paulo') + make_interval(days => p_dias) + interval '12 hours')
         at time zone 'America/Sao_Paulo'
$$;
create function pg_temp.agendar(p_id uuid, p_dias int default 0, p_link uuid default '00000000-0000-4000-8000-0000000000d1',
                                p_type text default 'consulta', p_modality text default 'presencial',
                                p_person uuid default '00000000-0000-4000-8000-0000000000e1', p_prov uuid default null,
                                p_return uuid default null) returns void language sql as $$
  insert into atta_in.appointment (id, tenant_id, person_id, provisional_patient_id, professional_link_id,
                                   appointment_type, modality, starts_at, ends_at, return_of_appointment_id)
  values (p_id, '00000000-0000-4000-8000-00000000000a', p_person, p_prov, p_link, p_type, p_modality, pg_temp.meio_dia(p_dias),
          pg_temp.meio_dia(p_dias) + interval '1 hour', p_return)
$$;
create function pg_temp.eventos(p_action text) returns int language sql security definer as $$
  select count(*)::int from audit.event where action = p_action
$$;
-- link do Boarding Check emitido para o atendimento (como o MIG-13 fará)
create function pg_temp.emitir_link(p_appointment uuid) returns void language sql security definer as $$
  insert into platform.access_grant (purpose, tenant_id, professional_link_id, appointment_id, secret_hash, expires_at, sent_at)
  values ('professional_boarding', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000d1',
          p_appointment, sha256(p_appointment::text::bytea), now() + interval '8 hours', now())
$$;
create function pg_temp.link_revogado(p_appointment uuid) returns boolean language sql security definer as $$
  select bool_and(revoked_at is not null) from platform.access_grant where appointment_id = p_appointment
$$;
-- leva um atendimento Em preenchimento a Pronto pelo caminho interno (como o check-in do MIG-13 fará)
create function pg_temp.ate_pronto(p_id uuid) returns void language sql security definer as $$
  select atta_in.apply_transition(p_id, '00000000-0000-4000-8000-00000000000a', 'pronto');
$$;
create function pg_temp.trilha_remarcar(p_id uuid) returns text language sql security definer as $$
  select string_agg(k, ',' order by k) from audit.event e, jsonb_object_keys(e.after) k
  where e.action = 'appointment.change' and e.entity_id = p_id
$$;
create function pg_temp.propass_link3() returns void language sql security definer as $$
  insert into platform.professional (id, display_name, council, council_uf, council_number, cpf_hmac, cpf_masked, cpf_enc,
                                     email_enc, dek_wrapped, kek_version)
  values ('00000000-0000-4000-8000-0000000000f3', 'Dr. Fictício Dois', 'crm', 'SP', '777', sha256('cpf-prof-3'::bytea),
          '···.···.000-03', '\x01', '\x01', '\x01', 1);
  insert into platform.professional_tenant_link (id, tenant_id, professional_id, invite_email_hmac, invite_email_enc,
                                                 envelope_id, dek_wrapped, kek_version, propass_completed_at,
                                                 privacy_notice_version, privacy_notice_ack_at)
  values ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-00000000000a',
          '00000000-0000-4000-8000-0000000000f3', sha256('dr3@a.test'::bytea), '\x01', gen_random_uuid(), '\x01', 1, now(),
          'v1', now());
$$;
create function pg_temp.status(p_id uuid) returns text language sql security definer as $$
  select status from atta_in.appointment where id = p_id
$$;

do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated', pg_my_temp_schema()::regnamespace);
end $$;

select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
           where oid in ('atta_in.appointment'::regclass, 'atta_in.appointment_clinic_service'::regclass,
                         'atta_in.appointment_transition'::regclass)), 'as 3 tabelas com RLS forçada');

select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'COLABORADOR');
select lives_ok($$ select pg_temp.agendar('00000000-0000-4000-8000-00000000a001') $$, 'Colaborador agenda paciente da rede (hoje)');
select lives_ok($$ select pg_temp.agendar('00000000-0000-4000-8000-00000000a002', 1, p_person => null,
                                         p_prov => '00000000-0000-4000-8000-0000000000e9') $$,
                'agenda o paciente provisório da importação (ADR 0005 §4)');
select throws_ok($$ select pg_temp.agendar(gen_random_uuid(), 1, p_prov => '00000000-0000-4000-8000-0000000000e9') $$,
                 '23514', null, 'pessoa e provisório juntos: recusado');
select throws_ok($$ select pg_temp.agendar(gen_random_uuid(), 1, p_person => null) $$, '23514', null,
                 'sem paciente: recusado');
select throws_ok($$ select pg_temp.agendar(gen_random_uuid(), 1, p_link => '00000000-0000-4000-8000-0000000000d2') $$,
                 'P0001', 'ATTA-IN-0003', 'profissional sem PROpass concluído não recebe agendamento');
select throws_ok($$ select pg_temp.agendar(gen_random_uuid(), 1, p_type => 'procedimento', p_modality => 'online') $$,
                 '23514', null, 'procedimento online: recusado (RN-AGN-TIPO-04)');
select throws_ok($$ select pg_temp.agendar(gen_random_uuid(), 1, p_type => 'retorno') $$, '23514', null,
                 'retorno sem origem: recusado (RN-AGN-TIPO-02)');
select throws_ok($$ select pg_temp.agendar(gen_random_uuid(), 2, p_type => 'retorno',
                                          p_return => '00000000-0000-4000-8000-00000000a001') $$,
                 'P0001', 'ATTA-IN-0003', 'retorno de origem que não está Concluída: recusado');
select lives_ok($$ select pg_temp.agendar('00000000-0000-4000-8000-00000000a003', 0) $$,
                'encaixe (o mesmo profissional no mesmo horário) é aceito até o CTO decidir (PDD §10.2.1)');

-- data específica: clínica fechada
select lives_ok($$ insert into atta_in.special_date (tenant_id, starts_on, ends_on, name, kind)
                   values ('00000000-0000-4000-8000-00000000000a', (now() at time zone 'America/Sao_Paulo')::date + 5,
                           (now() at time zone 'America/Sao_Paulo')::date + 5, 'Recesso', 'clinica_fechada') $$,
                'clínica fechada daqui a 5 dias');
select throws_ok($$ select pg_temp.agendar(gen_random_uuid(), 5) $$, 'P0001', 'ATTA-IN-0003',
                 'dia de clínica fechada não recebe agendamento');

-- Serviços: só os autorizados ao profissional
select lives_ok($$ insert into atta_in.appointment_clinic_service (tenant_id, appointment_id, clinic_service_id)
                   values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-0000000000c1') $$,
                'Serviço autorizado ao profissional');
select throws_ok($$ insert into atta_in.appointment_clinic_service (tenant_id, appointment_id, clinic_service_id)
                    values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-0000000000c2') $$,
                 'P0001', 'ATTA-IN-0003', 'Serviço não autorizado ao profissional: recusado');

-- estados: só por função; a recepção marca ausente (no dia), cancela com motivo e conclui pela recepção
select throws_ok($$ update atta_in.appointment set status = 'concluido' $$, '42501', null, 'status nunca por UPDATE direto');
select throws_ok($$ select atta_in.apply_transition('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000000a', 'concluido') $$,
                 '42501', null, 'a função interna de transição não é do painel');
select throws_ok($$ select atta_in.transition_appointment('00000000-0000-4000-8000-00000000a002', 'ausente') $$,
                 'P0001', 'ATTA-IN-0003', 'ausente só no dia do atendimento');
select lives_ok($$ select atta_in.transition_appointment('00000000-0000-4000-8000-00000000a001', 'ausente') $$,
                'marcar ausente no dia');
select throws_ok($$ select atta_in.transition_appointment('00000000-0000-4000-8000-00000000a003', 'cancelado') $$,
                 'P0001', 'ATTA-IN-0001', 'cancelar sem motivo: recusado');
select throws_ok($$ select atta_in.transition_appointment('00000000-0000-4000-8000-00000000a003', 'cancelado',
                                                         'paciente pediu para desmarcar') $$,
                 'P0001', 'ATTA-IN-0001', 'cancelar com texto livre: recusado (lista fechada, Regra Transversal 3)');
select throws_ok($$ select atta_in.transition_appointment('00000000-0000-4000-8000-00000000a003', 'cancelado',
                                                         'paciente_desistiu') $$,
                 'P0001', 'ATTA-IN-0001', 'antes da chegada, só os motivos de agendamento (§10.2.2)');
select pg_temp.emitir_link('00000000-0000-4000-8000-00000000a003');
select lives_ok($$ select atta_in.transition_appointment('00000000-0000-4000-8000-00000000a003', 'cancelado',
                                                        'cancelado_pelo_paciente') $$, 'cancelar com motivo da lista');
select ok(pg_temp.link_revogado('00000000-0000-4000-8000-00000000a003'),
          'cancelado: o link do Boarding Check do atendimento é revogado na mesma transação (RN-FIC-07)');
select throws_ok($$ select atta_in.transition_appointment('00000000-0000-4000-8000-00000000a003', 'ausente') $$,
                 'P0001', 'ATTA-IN-0003', 'cancelado não volta (tabela do §10.2.2)');
select throws_ok($$ select atta_in.transition_appointment('00000000-0000-4000-8000-00000000a002', 'concluido',
                                                         'atendido no consultório', repeat('x', 60)) $$,
                 'P0001', 'ATTA-IN-0001', 'concluir pela recepção: motivo só em chip fixo (§10.2.3)');
select throws_ok($$ select atta_in.transition_appointment('00000000-0000-4000-8000-00000000a002', 'concluido',
                                                         'profissional_inacessivel', 'curta demais') $$,
                 'P0001', 'ATTA-IN-0001', 'concluir pela recepção: justificativa de no mínimo 50 caracteres');
select throws_ok($$ select atta_in.transition_appointment('00000000-0000-4000-8000-00000000a002', 'concluido',
                                                         'profissional_inacessivel', repeat('justificativa ', 5)) $$,
                 'P0001', 'ATTA-IN-0003', 'agendado não conclui direto (só a partir de Pronto ou Em atendimento)');
select is(pg_temp.status('00000000-0000-4000-8000-00000000a003'), 'cancelado', 'o estado ficou cancelado');
select ok(pg_temp.eventos('appointment.create') = 3 and pg_temp.eventos('appointment.transition') = 2,
          'cada agendamento e cada transição vão para a auditoria');

-- reabrir preenchimento (Ausente → Em preenchimento) e edição só em Agendado
select lives_ok($$ select atta_in.transition_appointment('00000000-0000-4000-8000-00000000a001', 'em_preenchimento') $$,
                'Reabrir preenchimento de um Ausente (§10.2.2)');
select throws_ok($$ select atta_in.transition_appointment('00000000-0000-4000-8000-00000000a002', 'em_preenchimento') $$,
                 'P0001', 'ATTA-IN-0003', 'reabrir só vale para Ausente');
select throws_ok($$ update atta_in.appointment set starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour'
                    where id = '00000000-0000-4000-8000-00000000a001' $$,
                 'P0001', 'ATTA-IN-0003', 'fora de Agendado não remarca');
select throws_ok($$ update atta_in.appointment set modality = 'online' where id = '00000000-0000-4000-8000-00000000a003' $$,
                 'P0001', 'ATTA-IN-0003', 'a modalidade de um Cancelado também não muda');
select throws_ok($$ delete from atta_in.appointment_clinic_service where appointment_id = '00000000-0000-4000-8000-00000000a001' $$,
                 'P0001', 'ATTA-IN-0003', 'fora de Agendado não troca Serviço');
-- remarcar um Agendado: auditado só com o que mudou
select lives_ok($$ update atta_in.appointment set starts_at = starts_at + interval '2 hours', ends_at = ends_at + interval '2 hours'
                   where id = '00000000-0000-4000-8000-00000000a002' $$, 'remarcar um Agendado');
select is(pg_temp.trilha_remarcar('00000000-0000-4000-8000-00000000a002'), 'ends_at,starts_at',
          'remarcar vai para a auditoria com before/after só do que mudou');
-- trocar o profissional: os Serviços do agendamento precisam estar autorizados ao novo
select lives_ok($$ insert into atta_in.appointment_clinic_service (tenant_id, appointment_id, clinic_service_id)
                   values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-0000000000c1') $$,
                'Serviço autorizado no agendamento do provisório');
-- concluir pela recepção a partir de Pronto revoga o link
select pg_temp.ate_pronto('00000000-0000-4000-8000-00000000a001');
select pg_temp.emitir_link('00000000-0000-4000-8000-00000000a001');
select lives_ok($$ select atta_in.transition_appointment('00000000-0000-4000-8000-00000000a001', 'concluido',
                   'profissional_inacessivel', repeat('justificativa ', 5)) $$,
                'concluir pela recepção a partir de Pronto, com chip e justificativa');
select ok(pg_temp.link_revogado('00000000-0000-4000-8000-00000000a001'),
          'concluído: o link do Boarding Check é revogado na mesma transação (RN-FIC-07)');

select lives_ok($$ select pg_temp.propass_link3() $$, 'um 2º profissional com PROpass, sem o Serviço');
select throws_ok($$ update atta_in.appointment set professional_link_id = '00000000-0000-4000-8000-0000000000d3'
                    where id = '00000000-0000-4000-8000-00000000a002' $$,
                 'P0001', 'ATTA-IN-0003', 'trocar para profissional sem o Serviço autorizado: recusado');

-- RN-CFG-01: horário do profissional dentro do funcionamento
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
insert into atta_in.business_hours (tenant_id, weekday, starts_at, ends_at) values ('00000000-0000-4000-8000-00000000000a', 1, '08:00', '18:00');
select throws_ok($$ insert into atta_in.professional_schedule (tenant_id, professional_link_id, weekdays, starts_at, ends_at)
                    values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000d1', '{1}', '07:00', '12:00') $$,
                 'P0001', 'ATTA-IN-0003', 'horário do profissional fora do funcionamento: recusado (RN-CFG-01)');
select lives_ok($$ insert into atta_in.professional_schedule (tenant_id, professional_link_id, weekdays, starts_at, ends_at)
                   values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000d1', '{1}', '09:00', '17:00') $$,
                'horário dentro do funcionamento');

-- isolamento e vínculo removido
select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'ADMIN');
select is((select count(*)::int from atta_in.appointment), 0, 'B não vê os agendamentos da A');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select pg_temp.remover_vinculo();
select is((select count(*)::int from atta_in.appointment), 0, 'vínculo removido: o ADMIN não vê agendamentos');
select throws_ok($$ select pg_temp.agendar(gen_random_uuid(), 1) $$, '42501', null,
                 'vínculo removido: o ADMIN não agenda');

select * from finish();
rollback;
