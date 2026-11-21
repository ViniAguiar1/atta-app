-- MIG-11: visões Todos e Concluídos da Agenda (api.agenda_range). Horários fixos no dia da clínica: passa a qualquer hora.
begin;
select plan(17);


insert into platform.tenant (id, name) values ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A'), ('00000000-0000-4000-8000-00000000000b', 'Clínica Fictícia B');
insert into network.person (id, full_name, social_name, cpf_hmac, cpf_masked, cpf_enc, dek_wrapped, kek_version)
values ('00000000-0000-4000-8000-0000000000e1', 'Paciente Fictícia', 'Mari', sha256('cpf-e1'::bytea), '···.···.247-25',
        '\x01', '\x01', 1);
insert into network.person_tenant_link (tenant_id, person_id) values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000e1');
insert into network.person_import_provisional (id, tenant_id, import_batch_id, cpf_hmac, cpf_masked, cpf_enc, full_name,
                                               dek_wrapped, kek_version)
values ('00000000-0000-4000-8000-0000000000e9', '00000000-0000-4000-8000-00000000000a', gen_random_uuid(), sha256('cpf-prov'::bytea), '···.···.000-00',
        '\x01', 'Provisório Fictício', '\x01', 1);
insert into platform.professional (id, display_name, council, council_uf, council_number, cpf_hmac, cpf_masked, cpf_enc,
                                   email_enc, dek_wrapped, kek_version)
values ('00000000-0000-4000-8000-0000000000f1', 'Dra. Fictícia', 'cro', 'SP', '12345', sha256('cpf-prof'::bytea),
        '···.···.000-01', '\x01', '\x01', '\x01', 1);
insert into platform.professional_tenant_link (id, tenant_id, professional_id, invite_email_hmac, invite_email_enc,
                                               envelope_id, dek_wrapped, kek_version, propass_completed_at,
                                               privacy_notice_version, privacy_notice_ack_at)
values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000f1', sha256('dra@a.test'::bytea),
        '\x01', gen_random_uuid(), '\x01', 1, now(), 'v1', now());
insert into atta_in.clinic_service (id, tenant_id, name, duration_min) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000000a', 'Limpeza de Pele Fictícia', 60);
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

create function pg_temp.hora(p_dias int, p_hora int) returns timestamptz language sql as $$
  select (date_trunc('day', now() at time zone 'America/Sao_Paulo') + make_interval(days => p_dias, hours => p_hora))
         at time zone 'America/Sao_Paulo'
$$;
create function pg_temp.agendar(p_id uuid, p_inicio timestamptz) returns void language sql security definer as $$
  insert into atta_in.appointment (id, tenant_id, person_id, professional_link_id, appointment_type, modality, starts_at, ends_at)
  values (p_id, '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000e1',
          '00000000-0000-4000-8000-0000000000d1', 'consulta', 'presencial', p_inicio, p_inicio + interval '1 hour')
$$;
create function pg_temp.servico(p_id uuid) returns void language sql security definer as $$
  insert into atta_in.appointment_clinic_service (tenant_id, appointment_id, clinic_service_id)
  values ('00000000-0000-4000-8000-00000000000a', p_id, '00000000-0000-4000-8000-0000000000c1')
$$;
create function pg_temp.transitar(p_id uuid, p_to text, p_reason text default null) returns void
language sql security definer as $$
  select atta_in.apply_transition(p_id, '00000000-0000-4000-8000-00000000000a', p_to, p_reason)
$$;
create function pg_temp.concluir(p_id uuid) returns void language sql as $$
  select pg_temp.transitar(p_id, 'em_preenchimento');
  select pg_temp.transitar(p_id, 'pronto');
  select pg_temp.transitar(p_id, 'concluido');
$$;
create function pg_temp.ids(p jsonb) returns text language sql as $$
  select string_agg(right(e ->> 'id', 4), ',' order by i) from jsonb_array_elements(p -> 'data') with ordinality x (e, i)
$$;

do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated', pg_my_temp_schema()::regnamespace);
end $$;

-- ontem 10 h (Agendado), hoje 10 h (Em preenchimento), hoje 11 h (Concluído, com Serviço), hoje 12 h (Cancelado),
-- amanhã 10 h (Agendado), daqui a 5 dias (fora do intervalo) e um Concluído de 40 dias atrás (fora da semana e do mês)
select pg_temp.agendar('00000000-0000-4000-8000-00000000b001', pg_temp.hora(-1, 10));
select pg_temp.agendar('00000000-0000-4000-8000-00000000b002', pg_temp.hora(0, 10));
select pg_temp.transitar('00000000-0000-4000-8000-00000000b002', 'em_preenchimento');
select pg_temp.agendar('00000000-0000-4000-8000-00000000b003', pg_temp.hora(0, 11));
select pg_temp.servico('00000000-0000-4000-8000-00000000b003');
select pg_temp.concluir('00000000-0000-4000-8000-00000000b003');
select pg_temp.agendar('00000000-0000-4000-8000-00000000b007', pg_temp.hora(0, 12));
select pg_temp.transitar('00000000-0000-4000-8000-00000000b007', 'cancelado', 'cancelado_pelo_paciente');
select pg_temp.agendar('00000000-0000-4000-8000-00000000b004', pg_temp.hora(1, 10));
select pg_temp.agendar('00000000-0000-4000-8000-00000000b005', pg_temp.hora(5, 10));
select pg_temp.agendar('00000000-0000-4000-8000-00000000b006', pg_temp.hora(-40, 10));
select pg_temp.concluir('00000000-0000-4000-8000-00000000b006');

select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'COLABORADOR');
create temp table hoje_local as select (now() at time zone 'America/Sao_Paulo')::date as d;
grant select on hoje_local to authenticated;

-- Todos: o intervalo, em ordem, sem o Concluído
select is((select pg_temp.ids(api.agenda_range('todos', d - 1, d + 2)) from hoje_local), 'b001,b002,b007,b004',
          'Todos: ontem a depois de amanhã, em ordem de horário, sem o Concluído (§10.2.2) e sem o que está fora');
select ok((select r -> 'page' ->> 'next_cursor' is null and (r ->> 'from')::date = d - 1 and (r ->> 'to')::date = d + 2
           from hoje_local, api.agenda_range('todos', d - 1, d + 2) r), 'Todos: o período e a página na resposta');
select is((select pg_temp.ids(api.agenda_range('todos', d - 1, d + 2, p_status => array['cancelado'])) from hoje_local),
          'b007', 'Todos com filtro de estado');
select throws_ok($$ select api.agenda_range('todos', current_date, current_date, p_status => array['concluido']) $$,
                 'P0001', 'ATTA-IN-0001', 'Todos não filtra por Concluído');
select ok((select (r ->> 'from')::date = d and (r ->> 'to')::date = d + 91
                  and pg_temp.ids(r) = 'b002,b007,b004,b005'
           from hoje_local, api.agenda_range('todos') r),
          'Todos sem período: hoje no fuso da clínica e os 91 dias seguintes (padrão no banco)');
select ok((select (r ->> 'to')::date = d - 1 + 91 from hoje_local, api.agenda_range('todos', d - 1) r),
          'Todos só com o início: até início + 91');
select ok((select (r ->> 'to')::date - (r ->> 'from')::date = 91
           from hoje_local, api.agenda_range('todos', d, d + 91) r), 'Todos com exatamente 92 dias: aceito');
select throws_ok($$ select api.agenda_range('todos', current_date + 1, current_date) $$, 'P0001', 'ATTA-IN-0001',
                 'Todos com fim antes do início: recusado');
select throws_ok($$ select api.agenda_range('todos', current_date, current_date + 92) $$, 'P0001', 'ATTA-IN-0001',
                 'Todos com mais de 92 dias: recusado');

-- Concluídos: semana e mês correntes, calculados no banco
select is(pg_temp.ids(api.agenda_range('concluidos')), 'b003', 'Concluídos da semana: só o de hoje (padrão semana)');
select ok((select (r ->> 'from')::date <= d and (r ->> 'to')::date >= d and (r ->> 'to')::date - (r ->> 'from')::date = 6
                  and extract(isodow from (r ->> 'from')::date) = 1
           from hoje_local, api.agenda_range('concluidos', p_period => 'semana') r),
          'semana corrente: de segunda a domingo, com hoje dentro');
select is(pg_temp.ids(api.agenda_range('concluidos', p_period => 'mes')), 'b003',
          'Concluídos do mês: o de 40 dias atrás fica de fora');
select ok((select e -> 'services' = '[{"id": "00000000-0000-4000-8000-0000000000c1", "name": "Limpeza de Pele Fictícia"}]'::jsonb
                  and e ->> 'status' = 'concluido' and e -> 'allowed_actions' @> '[{"action": "detalhes"}]'::jsonb
           from jsonb_array_elements(api.agenda_range('concluidos') -> 'data') e),
          'Concluídos: com os Serviços realizados e as ações do Concluído');
select throws_ok($$ select api.agenda_range('concluidos', current_date, current_date) $$, 'P0001', 'ATTA-IN-0001',
                 'Concluídos não recebe intervalo: o período é semana ou mês');
select throws_ok($$ select api.agenda_range('calendario') $$, 'P0001', 'ATTA-IN-0001', 'visão fora da lista: recusada');

-- isolamento e vínculo removido
select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'ADMIN');
select is((select jsonb_array_length(api.agenda_range('todos', d - 1, d + 2) -> 'data') from hoje_local), 0,
          'B não vê a agenda da A');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select pg_temp.remover_vinculo();
select throws_ok($$ select api.agenda_range('concluidos') $$, '42501', 'ATTA-AUTH-0004', 'vínculo removido: não lê');

select * from finish();
rollback;
