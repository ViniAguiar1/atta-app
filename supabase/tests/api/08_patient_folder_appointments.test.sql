-- MIG-12: agendamentos e documentos da Pasta do Paciente (api.patient_folder_appointments). Horários fixos no dia da
-- clínica, para passar a qualquer hora. Dados fictícios; documentos só em contagem e estado, nada de saúde.
begin;
select plan(16);

insert into platform.tenant (id, name) values
  ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A'),
  ('00000000-0000-4000-8000-00000000000b', 'Clínica Fictícia B');
insert into network.person (id, full_name, cpf_hmac, cpf_masked, cpf_enc, dek_wrapped, kek_version) values
  ('00000000-0000-4000-8000-0000000000e1', 'Paciente Fictícia', sha256('cpf-e1'::bytea), '···.···.247-25', '\x01', '\x01', 1),
  ('00000000-0000-4000-8000-0000000000e2', 'Outro Fictício', sha256('cpf-e2'::bytea), '···.···.777-35', '\x01', '\x01', 1),
  ('00000000-0000-4000-8000-0000000000e3', 'Só da B', sha256('cpf-e3'::bytea), '···.···.447-05', '\x01', '\x01', 1);
insert into network.person_tenant_link (tenant_id, person_id) values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000e1'),
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000e2'),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000e3');
insert into platform.professional (id, display_name, council, council_uf, council_number, cpf_hmac, cpf_masked, cpf_enc,
                                   email_enc, dek_wrapped, kek_version)
values ('00000000-0000-4000-8000-0000000000f1', 'Dra. Fictícia', 'cro', 'SP', '12345', sha256('cpf-prof'::bytea),
        '···.···.000-01', '\x01', '\x01', '\x01', 1);
-- conselho conferido: só regularizado recebe agendamento (ADR 0006 §3)
update platform.professional set council_status = 'regularizado', council_verified_at = now() where council_status is null;
insert into platform.professional_tenant_link (id, tenant_id, professional_id, invite_email_hmac, invite_email_enc,
                                               envelope_id, dek_wrapped, kek_version, propass_completed_at)
values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000f1',
        sha256('dra@a.test'::bytea), '\x01', gen_random_uuid(), '\x01', 1, now());
insert into atta_in.clinic_service (id, tenant_id, name, duration_min) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000000a', 'Limpeza de Pele Fictícia', 60);
insert into atta_in.professional_service (tenant_id, professional_link_id, clinic_service_id)
values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1');

create function pg_temp.entrar(p_tenant uuid, p_role text) returns void language plpgsql as $$
declare
  v_user uuid;
begin
  perform set_config('role', 'postgres', true);
  if p_role = 'ADMIN' then   -- no máximo 2 ADMIN vivos (MIG-06)
    select m.user_id into v_user from platform.membership m
    where m.tenant_id = p_tenant and m.app_role = 'ADMIN' and m.status = 'active' and m.deleted_at is null limit 1;
  end if;
  if v_user is null then
    v_user := gen_random_uuid();
    insert into auth.users (id, email) values (v_user, v_user::text || '@teste.invalid');
    if p_tenant is not null and p_role in ('ADMIN', 'COLABORADOR') then
      insert into platform.membership (tenant_id, user_id, app_role) values (p_tenant, v_user, p_role);
    end if;
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'tenant_id', p_tenant, 'app_role', p_role,
                      'aal', case when p_role = 'ADMIN' then 'aal2' else 'aal1' end,
                      'amr', json_build_array(json_build_object('method', 'password',
                                                                'timestamp', extract(epoch from now())::bigint)))::text, true);
end $$;
create function pg_temp.hora(p_dias int, p_hora int) returns timestamptz language sql as $$
  select (date_trunc('day', now() at time zone 'America/Sao_Paulo') + make_interval(days => p_dias, hours => p_hora))
         at time zone 'America/Sao_Paulo'
$$;
create function pg_temp.agendar(p_id uuid, p_person uuid, p_inicio timestamptz) returns void language sql security definer as $$
  insert into atta_in.appointment (id, tenant_id, person_id, professional_link_id, appointment_type, modality, starts_at, ends_at)
  values (p_id, '00000000-0000-4000-8000-00000000000a', p_person, '00000000-0000-4000-8000-0000000000d1', 'consulta',
          'presencial', p_inicio, p_inicio + interval '1 hour');
  insert into atta_in.appointment_clinic_service (tenant_id, appointment_id, clinic_service_id)
  values ('00000000-0000-4000-8000-00000000000a', p_id, '00000000-0000-4000-8000-0000000000c1')
$$;
create function pg_temp.transitar(p_id uuid, p_to text, p_reason text default null) returns void
language sql security definer as $$
  select atta_in.apply_transition(p_id, '00000000-0000-4000-8000-00000000000a', p_to, p_reason)
$$;
-- documentos do atendimento: um termo obrigatório (aguardando ou pré-assinado) e um doc clínico, sem conteúdo
create function pg_temp.termo(p_id uuid, p_appointment uuid, p_status text) returns void language sql security definer as $$
  insert into documents.document (id, tenant_id, template_version_id, person_id, folder_section, appointment_id)
  select p_id, '00000000-0000-4000-8000-00000000000a', v.id, '00000000-0000-4000-8000-0000000000e1', 'termos', p_appointment
  from documents.template_version v join documents.template t on t.id = v.template_id
  where t.tenant_id = '00000000-0000-4000-8000-00000000000a' and t.title = 'TCLE fictício';
  update documents.document set status = p_status where id = p_id and p_status <> 'aguardando_assinatura';
$$;
create function pg_temp.doc_clinico(p_appointment uuid) returns void language sql security definer as $$
  insert into documents.document (tenant_id, person_id, folder_section, appointment_id)
  values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000e1', 'docs_clinicos', p_appointment)
$$;
create function pg_temp.eventos() returns int language sql security definer as $$
  select count(*)::int from audit.event where action = 'patient.appointments_list'
$$;
create function pg_temp.ids(p jsonb) returns text language sql as $$
  select string_agg(right(e ->> 'id', 4), ',' order by i) from jsonb_array_elements(p -> 'data') with ordinality x (e, i)
$$;

do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated', pg_my_temp_schema()::regnamespace);
end $$;

-- modelo de termo obrigatório publicado (pelo gestor, como na tela de Termos & Docs)
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
insert into documents.template (kind, title, frequency, required, draft_body)
values ('tcle', 'TCLE fictício', 'por_procedimento', true, 'Texto fictício do TCLE.');
select api.template_set_services((select id from documents.template where title = 'TCLE fictício'),
                                 array['00000000-0000-4000-8000-0000000000c1']::uuid[]);
select api.atta_in_template_publish((select id from documents.template where title = 'TCLE fictício'));

-- da paciente: um concluído há 10 dias (termo pré-assinado e doc clínico), hoje às 9 h (cancelado), hoje às 10 h
-- (Agendado, com termo obrigatório aguardando) e daqui a 3 dias; de outro paciente, hoje às 11 h (não aparece)
select pg_temp.agendar('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-0000000000e1', pg_temp.hora(-10, 10));
select pg_temp.transitar('00000000-0000-4000-8000-00000000a001', 'em_preenchimento');
select pg_temp.termo('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000a001', 'pre_assinado');
select pg_temp.transitar('00000000-0000-4000-8000-00000000a001', 'pronto');
select pg_temp.transitar('00000000-0000-4000-8000-00000000a001', 'concluido');
select pg_temp.doc_clinico('00000000-0000-4000-8000-00000000a001');
select pg_temp.agendar('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-0000000000e1', pg_temp.hora(0, 9));
select pg_temp.transitar('00000000-0000-4000-8000-00000000a002', 'cancelado', 'cancelado_pelo_paciente');
select pg_temp.agendar('00000000-0000-4000-8000-00000000a003', '00000000-0000-4000-8000-0000000000e1', pg_temp.hora(0, 10));
select pg_temp.termo('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000a003', 'aguardando_assinatura');
select pg_temp.agendar('00000000-0000-4000-8000-00000000a004', '00000000-0000-4000-8000-0000000000e1', pg_temp.hora(3, 10));
select pg_temp.agendar('00000000-0000-4000-8000-00000000a005', '00000000-0000-4000-8000-0000000000e2', pg_temp.hora(0, 11));

select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'COLABORADOR');
create temp table pasta as select api.patient_folder_appointments('00000000-0000-4000-8000-0000000000e1') as r;
grant select on pasta to authenticated;

select is((select pg_temp.ids(r) from pasta), 'a004,a003,a002,a001',
          'só os agendamentos da paciente, do mais novo ao mais antigo, com concluído e cancelado');
select ok((select r -> 'page' ->> 'next_cursor' is null and r ->> 'timezone' = 'America/Sao_Paulo' from pasta),
          'página e fuso da clínica na resposta');
select is((select r -> 'totals' from pasta),
          '{"appointments": 4, "terms_signed": 1, "clinical_docs": 1, "pendencies": 1}'::jsonb,
          'totais: 4 agendamentos, 1 termo assinado, 1 doc clínico, 1 pendência');
select ok((select (r -> 'today' ->> 'count')::int = 1
                  and (r -> 'today' ->> 'last_at')::timestamptz = pg_temp.hora(0, 10) from pasta),
          'hoje: 1 atendimento (o cancelado não conta), o último às 10 h');
select ok((select e -> 'services' = '[{"id": "00000000-0000-4000-8000-0000000000c1", "name": "Limpeza de Pele Fictícia"}]'::jsonb
                  and e -> 'professional' ->> 'display_name' = 'Dra. Fictícia' and e ->> 'status' = 'concluido'
           from pasta, jsonb_array_elements(r -> 'data') e where e ->> 'id' like '%a001'),
          'linha no formato da Agenda: Serviços realizados, profissional e estado');
select ok((select e -> 'milestones' ->> 'checkin_at' is not null and e -> 'milestones' ->> 'ready_at' is not null
                  and e -> 'milestones' ->> 'concluded_at' is not null and e -> 'milestones' ->> 'in_service_at' is null
           from pasta, jsonb_array_elements(r -> 'data') e where e ->> 'id' like '%a001'),
          'marcos do atendimento: check-in, pronto e concluído');
select ok((select (e ->> 'terms_count')::int = 1 and (e ->> 'clinical_docs_count')::int = 1 and e -> 'pending' = 'null'::jsonb
           from pasta, jsonb_array_elements(r -> 'data') e where e ->> 'id' like '%a001'),
          'concluído: 1 termo, 1 doc clínico, sem pendência');
select ok((select e -> 'pending' = '{"kind": "termo_nao_assinado", "required": true}'::jsonb and (e ->> 'terms_count')::int = 1
           from pasta, jsonb_array_elements(r -> 'data') e where e ->> 'id' like '%a003'),
          'Agendado com termo obrigatório aguardando: pendência termo_nao_assinado');
select ok((select e -> 'allowed_actions' @> '[{"action": "cancelar"}, {"action": "detalhes"}]'::jsonb
           from pasta, jsonb_array_elements(r -> 'data') e where e ->> 'id' like '%a003'),
          'as ações da Agenda, para o menu ⋮ da Pasta');
select ok((select not (r::text ~* 'saude|health|answer') from pasta), 'nada de saúde na resposta');
select is(pg_temp.eventos(), 1, 'a leitura vai para a trilha (patient.appointments_list, só contagens)');

-- página: o cursor traz a anterior
select is((select pg_temp.ids(api.patient_folder_appointments('00000000-0000-4000-8000-0000000000e1',
             to_char(pg_temp.hora(0, 10) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
             || '|00000000-0000-4000-8000-00000000a003'))), 'a002,a001', 'o cursor traz os mais antigos que ele');

-- outra clínica e permissão
select throws_ok($$ select api.patient_folder_appointments('00000000-0000-4000-8000-0000000000e3') $$, 'P0002',
                 'ATTA-CORE-0005', 'paciente de outra clínica: não encontrado');
select is(pg_temp.eventos(), 2, 'o não encontrado não grava trilha');
select throws_ok($$ select api.patient_folder_appointments('00000000-0000-4000-8000-0000000000e1', 'x') $$, 'P0001',
                 'ATTA-IN-0001', 'cursor inválido: recusado');
select pg_temp.entrar(null, null);
select throws_ok($$ select api.patient_folder_appointments('00000000-0000-4000-8000-0000000000e1') $$, '42501',
                 'ATTA-AUTH-0004', 'sem clínica: recusado');

select * from finish();
rollback;
