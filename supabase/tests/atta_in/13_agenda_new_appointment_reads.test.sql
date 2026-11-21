-- MIG-11: leituras do modal Novo agendamento (§10.2): durações, Serviços do profissional e horários livres. Dias fixos no
-- futuro, no fuso da clínica: passa a qualquer hora. Dados fictícios.
begin;
select plan(13);

insert into platform.tenant (id, name) values
  ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A'),
  ('00000000-0000-4000-8000-00000000000b', 'Clínica Fictícia B');
insert into network.person (id, full_name, cpf_hmac, cpf_masked, cpf_enc, dek_wrapped, kek_version)
values ('00000000-0000-4000-8000-0000000000e1', 'Paciente Fictícia', sha256('cpf-e1'::bytea), '···.···.247-25', '\x01', '\x01', 1);
insert into network.person_tenant_link (tenant_id, person_id)
values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000e1');
insert into platform.professional (id, display_name, council, council_uf, council_number, cpf_hmac, cpf_masked, cpf_enc,
                                   email_enc, dek_wrapped, kek_version, council_status, council_verified_at)
values ('00000000-0000-4000-8000-0000000000f1', 'Dra. Fictícia', 'cro', 'SP', '11111', sha256('cpf-p1'::bytea),
        '···.···.000-01', '\x01', '\x01', '\x01', 1, 'regularizado', now());
insert into platform.professional_tenant_link (id, tenant_id, professional_id, invite_email_hmac, invite_email_enc,
                                               envelope_id, dek_wrapped, kek_version, propass_completed_at)
values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000f1',
        sha256('p1@a.test'::bytea), '\x01', gen_random_uuid(), '\x01', 1, now()),
       ('00000000-0000-4000-8000-0000000000db', '00000000-0000-4000-8000-00000000000b', null,
        sha256('outra@b.test'::bytea), '\x01', gen_random_uuid(), '\x01', 1, null);
insert into atta_in.clinic_service (id, tenant_id, name, duration_min) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000000a', 'Limpeza de Pele', 60),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-00000000000a', 'Avaliação Facial', 30),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-00000000000a', 'Não Autorizado', 45),
  ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-00000000000a', 'Excluído', 20);
insert into atta_in.professional_service (tenant_id, professional_link_id, clinic_service_id) values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1'),
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c2'),
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c4');
update atta_in.clinic_service set deleted_at = now() where id = '00000000-0000-4000-8000-0000000000c4';

create function pg_temp.entrar(p_tenant uuid, p_role text) returns void language plpgsql as $$
declare
  v_user uuid := gen_random_uuid();
begin
  perform set_config('role', 'postgres', true);
  insert into auth.users (id, email) values (v_user, v_user::text || '@teste.invalid');
  if p_tenant is not null then
    insert into platform.membership (tenant_id, user_id, app_role) values (p_tenant, v_user, p_role);
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'tenant_id', p_tenant, 'app_role', p_role,
                      'aal', case when p_role = 'ADMIN' then 'aal2' else 'aal1' end,
                      'amr', json_build_array(json_build_object('method', 'password',
                                                                'timestamp', extract(epoch from now())::bigint)))::text, true);
end $$;
-- um dia local da clínica a partir de hoje, e uma hora desse dia
create function pg_temp.dia(p_dias int) returns date language sql as $$
  select (now() at time zone 'America/Sao_Paulo')::date + p_dias
$$;
create function pg_temp.hora(p_dias int, p_h int, p_min int default 0) returns timestamptz language sql as $$
  select (pg_temp.dia(p_dias) + make_time(p_h, p_min, 0)) at time zone 'America/Sao_Paulo'
$$;
create function pg_temp.montar_agenda() returns void language sql security definer as $$
  -- todos os dias, 09:00 às 13:00, com pausa das 11:00 às 12:00; clínica fechada no dia +8; um agendamento no dia +7 às 9 h
  insert into atta_in.professional_schedule (tenant_id, professional_link_id, weekdays, starts_at, ends_at)
  values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000d1', '{0,1,2,3,4,5,6}', '09:00', '13:00');
  insert into atta_in.professional_break (tenant_id, professional_link_id, weekdays, starts_at, ends_at)
  values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000d1', '{0,1,2,3,4,5,6}', '11:00', '12:00');
  insert into atta_in.special_date (tenant_id, starts_on, ends_on, name, kind)
  values ('00000000-0000-4000-8000-00000000000a', pg_temp.dia(8), pg_temp.dia(8), 'Feriado fictício', 'clinica_fechada');
  insert into atta_in.appointment (tenant_id, person_id, professional_link_id, appointment_type, modality, starts_at, ends_at)
  values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d1',
          'consulta', 'presencial', pg_temp.hora(7, 9), pg_temp.hora(7, 10));
$$;
create function pg_temp.consulta_45() returns void language sql security definer as $$
  insert into atta_in.setting (tenant_id, key, level, value_int)
  values ('00000000-0000-4000-8000-00000000000a', 'duracao_consulta_min', 'unidade', 45)
$$;
create function pg_temp.livres(p_dias int, p_min int) returns jsonb language sql as $$
  select api.agenda_free_slots('00000000-0000-4000-8000-0000000000d1', pg_temp.dia(p_dias), p_min)
$$;

do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated', pg_my_temp_schema()::regnamespace);
end $$;

select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select pg_temp.montar_agenda();
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'COLABORADOR');

-- durações (§10.2: padrões da PO 60/30/30, configuráveis pela clínica)
select is(api.agenda_durations(), '{"consulta": 60, "avaliacao": 30, "retorno": 30}'::jsonb, 'durações padrão da PO');
select pg_temp.consulta_45();
select is(api.agenda_durations() ->> 'consulta', '45', 'a clínica configura a duração da Consulta');

-- Serviços do profissional: só os autorizados, ativos e não excluídos, com a duração
select is((select jsonb_agg(e ->> 'name' order by i) from jsonb_array_elements(
             api.agenda_professional_services('00000000-0000-4000-8000-0000000000d1')) with ordinality x (e, i)),
          '["Avaliação Facial", "Limpeza de Pele"]'::jsonb, 'só os Serviços autorizados ao profissional, sem o excluído');
select is((select (e ->> 'duration_min')::int from jsonb_array_elements(
             api.agenda_professional_services('00000000-0000-4000-8000-0000000000d1')) e where e ->> 'name' = 'Limpeza de Pele'),
          60, 'cada Serviço com a duração em minutos');
select throws_ok($$ select api.agenda_professional_services('00000000-0000-4000-8000-0000000000db') $$, 'P0002',
                 'ATTA-CORE-0005', 'profissional de outra clínica: não encontrado');

-- horários livres (§10.2: passos de 1 h, só onde cabe a duração total)
select is(pg_temp.livres(9, 60) -> 'slots', jsonb_build_array(pg_temp.hora(9, 9), pg_temp.hora(9, 10), pg_temp.hora(9, 12)),
          '60 min: 9, 10 e 12 h (a pausa das 11 h sai)');
select is(pg_temp.livres(9, 60) -> 'first_free', to_jsonb(pg_temp.hora(9, 9)), 'o primeiro livre sugerido');
select is(pg_temp.livres(9, 90) -> 'slots', jsonb_build_array(pg_temp.hora(9, 9)),
          '90 min: só às 9 h (às 10 h cruza a pausa; às 12 h passa do fim da janela)');
select is(pg_temp.livres(7, 60) -> 'slots', jsonb_build_array(pg_temp.hora(7, 10), pg_temp.hora(7, 12)),
          'o horário já agendado sai');
select ok((select r -> 'slots' = '[]'::jsonb
                  and r -> 'next_free' = jsonb_build_object('local_date', pg_temp.dia(9), 'starts_at', pg_temp.hora(9, 9))
           from (select pg_temp.livres(8, 60) r) x), 'clínica fechada: nenhum horário, e o próximo livre no dia seguinte');
select is(pg_temp.livres(-1, 60) -> 'slots', '[]'::jsonb, 'dia passado: nenhum horário');
select throws_ok($$ select pg_temp.livres(9, 3) $$, 'P0001', 'ATTA-IN-0001', 'duração fora de 5 a 480: recusada');

select pg_temp.entrar(null, null);
select throws_ok($$ select api.agenda_durations() $$, '42501', 'ATTA-AUTH-0004', 'sem clínica: recusado');

select * from finish();
rollback;
