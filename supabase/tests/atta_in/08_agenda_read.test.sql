-- MIG-11c: leitura da Agenda (api.agenda_day e api.agenda_summary) e "Confirmar agendamento". Dados fictícios.
begin;
select plan(29);

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
                                               envelope_id, dek_wrapped, kek_version, propass_completed_at)
values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000f1', sha256('dra@a.test'::bytea),
        '\x01', gen_random_uuid(), '\x01', 1, now());
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
-- agenda direto como postgres (o caminho do painel tem teste no 07_appointment)
create function pg_temp.agendar(p_id uuid, p_inicio timestamptz, p_type text default 'consulta',
                                p_modality text default 'presencial',
                                p_person uuid default '00000000-0000-4000-8000-0000000000e1', p_prov uuid default null)
returns void language sql security definer as $$
  insert into atta_in.appointment (id, tenant_id, person_id, provisional_patient_id, professional_link_id,
                                   appointment_type, modality, starts_at, ends_at)
  values (p_id, '00000000-0000-4000-8000-00000000000a', p_person, p_prov, '00000000-0000-4000-8000-0000000000d1', p_type, p_modality, p_inicio,
          p_inicio + interval '1 hour')
$$;
create function pg_temp.pausa() returns void language sql security definer as $$
  insert into atta_in.professional_break (tenant_id, professional_link_id, weekdays, starts_at, ends_at)
  values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000d1', '{0,1,2,3,4,5,6}', '12:00', '13:00')
$$;
create function pg_temp.janela_consulta(p_h int) returns void language sql security definer as $$
  insert into atta_in.setting (tenant_id, key, level, appointment_type, value_int)
  values ('00000000-0000-4000-8000-00000000000a', 'janela_de_confirmacao_h', 'tipo_de_atendimento', 'consulta', p_h)
$$;
create function pg_temp.desligar_alternativo() returns void language sql security definer as $$
  insert into atta_in.setting (tenant_id, key, level, value_bool)
  values ('00000000-0000-4000-8000-00000000000a', 'fluxo_alternativo_habilitado', 'unidade', false)
$$;
create function pg_temp.transitar(p_id uuid, p_to text, p_reason text default null) returns void
language sql security definer as $$
  select atta_in.apply_transition(p_id, '00000000-0000-4000-8000-00000000000a', p_to, p_reason)
$$;

do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated', pg_my_temp_schema()::regnamespace);
end $$;

-- hoje: um atrasado (8 h, já passou), um Em preenchimento (10 h, provisório) e um concluído (11 h); amanhã: um futuro
select pg_temp.agendar('00000000-0000-4000-8000-00000000a001', now() - interval '1 hour');
select pg_temp.agendar('00000000-0000-4000-8000-00000000a002', now() + interval '1 minute', p_person => null,
                       p_prov => '00000000-0000-4000-8000-0000000000e9');
select pg_temp.transitar('00000000-0000-4000-8000-00000000a002', 'em_preenchimento');
select pg_temp.agendar('00000000-0000-4000-8000-00000000a003', now() + interval '2 minutes', p_type => 'avaliacao');
select pg_temp.transitar('00000000-0000-4000-8000-00000000a003', 'em_preenchimento');
select pg_temp.transitar('00000000-0000-4000-8000-00000000a003', 'pronto');
select pg_temp.transitar('00000000-0000-4000-8000-00000000a003', 'concluido');
select pg_temp.agendar('00000000-0000-4000-8000-00000000a004', pg_temp.hora(1, 10));
insert into atta_in.appointment_clinic_service (tenant_id, appointment_id, clinic_service_id)
values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000a004', '00000000-0000-4000-8000-0000000000c1');
select pg_temp.agendar('00000000-0000-4000-8000-00000000a005', pg_temp.hora(2, 10));

-- horário do profissional todos os dias, 09:00 às 13:00 (4 blocos de 1 h); pelo painel, para a auditoria ter a clínica
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
insert into atta_in.professional_schedule (tenant_id, professional_link_id, weekdays, starts_at, ends_at)
values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000d1', '{0,1,2,3,4,5,6}', '09:00', '13:00');

select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'COLABORADOR');
select ok((select (r ->> 'local_date')::date = (now() at time zone 'America/Sao_Paulo')::date
                  and r ->> 'timezone' = 'America/Sao_Paulo' and r -> 'page' ->> 'next_cursor' is null
           from api.agenda_day() r), 'o dia padrão é hoje no fuso da clínica, com timezone e página');
select is((select jsonb_array_length(api.agenda_day() -> 'data')), 3, 'hoje: os 3 agendamentos do dia');
select ok((select (e ->> 'late')::boolean from jsonb_array_elements(api.agenda_day() -> 'data') e
           where e ->> 'id' = '00000000-0000-4000-8000-00000000a001'), 'Agendado com o horário passado: atrasado (calculado no banco)');
select ok((select e -> 'patient' ->> 'display_name' = 'Mari' and e -> 'patient' ->> 'cpf_masked' = '···.···.247-25'
                  and e -> 'patient' ->> 'provisional_patient_id' is null
           from jsonb_array_elements(api.agenda_day() -> 'data') e
           where e ->> 'id' = '00000000-0000-4000-8000-00000000a001'), 'paciente da rede: nome social e CPF mascarado');
select ok((select e -> 'patient' ->> 'display_name' = 'Provisório Fictício' and e -> 'patient' ->> 'person_id' is null
           from jsonb_array_elements(api.agenda_day() -> 'data') e
           where e ->> 'id' = '00000000-0000-4000-8000-00000000a002'), 'paciente provisório: nome da importação');
select ok((select e -> 'professional' ->> 'display_name' = 'Dra. Fictícia' and (e ->> 'duration_min')::int = 60
           from jsonb_array_elements(api.agenda_day() -> 'data') e
           where e ->> 'id' = '00000000-0000-4000-8000-00000000a001'), 'profissional pelo vínculo e duração em minutos');
select ok((select e -> 'allowed_actions' @> '[{"action": "marcar_ausente"}, {"action": "cancelar"}]'::jsonb
                  and not e -> 'allowed_actions' @> '[{"action": "concluir_pela_recepcao"}]'::jsonb
           from jsonb_array_elements(api.agenda_day() -> 'data') e
           where e ->> 'id' = '00000000-0000-4000-8000-00000000a001'), 'ações do Agendado de hoje pela tabela do §10.2.2');
select ok((select e -> 'allowed_actions' = '[{"action": "envios_dos_links", "disabled_reason": null}, {"action": "enviar_termos", "disabled_reason": null}, {"action": "detalhes", "disabled_reason": null}]'::jsonb
           from jsonb_array_elements(api.agenda_day() -> 'data') e
           where e ->> 'id' = '00000000-0000-4000-8000-00000000a003'), 'ações do Concluído: envios, enviar termos e detalhes');
select ok((select e -> 'allowed_actions' @> '[{"action": "fluxo_alternativo"}, {"action": "fluxo_impresso"}]'::jsonb
           from jsonb_array_elements(api.agenda_day() -> 'data') e
           where e ->> 'id' = '00000000-0000-4000-8000-00000000a002'),
          'Em preenchimento, alternativo habilitado: os dois fluxos aparecem');
select pg_temp.desligar_alternativo();
select ok((select e -> 'allowed_actions' @> '[{"action": "fluxo_impresso"}]'::jsonb
                  and not e -> 'allowed_actions' @> '[{"action": "fluxo_alternativo"}]'::jsonb
           from jsonb_array_elements(api.agenda_day() -> 'data') e
           where e ->> 'id' = '00000000-0000-4000-8000-00000000a002'),
          'alternativo desligado: só o Fluxo impresso, que fica sempre disponível (§11.3)');
select is((select jsonb_array_length(api.agenda_day(p_status => array['em_preenchimento']) -> 'data')), 1,
          'filtro por estado (card Check-in)');
select is((select jsonb_array_length(api.agenda_day(p_search => 'Provis') -> 'data')), 1, 'busca por nome');
select is((select jsonb_array_length(api.agenda_day(p_cpf_hmac => sha256('cpf-e1'::bytea)) -> 'data')), 2,
          'busca por CPF (HMAC do servidor): os dois agendamentos de hoje da mesma paciente');
select throws_ok($$ select api.agenda_day(p_search => 'x') $$, 'P0001', 'ATTA-IN-0001', 'busca de 1 letra é recusada');
select throws_ok($$ select api.agenda_day(p_status => array['outro']) $$, 'P0001', 'ATTA-IN-0001', 'estado fora dos 7');

-- sem documento: o futuro tem Serviço sem modelo ativo; com modelo ativo vinculado, passa a ter documento
select ok((select (e -> 'documents') = '[]'::jsonb from jsonb_array_elements(api.agenda_day(pg_temp.hora(1, 0)::date) -> 'data') e),
          'amanhã: sem modelo ativo nos Serviços, sem documentos');
select is((select jsonb_array_length(api.agenda_day(p_no_document => true) -> 'data')), 2,
          'sem documento hoje: o atrasado e o Em preenchimento (o Concluído e a Avaliação não contam)');

-- cards
select ok((select r -> 'checkin' = '{"em_preenchimento": 1, "pronto": 0, "em_atendimento": 0}'::jsonb
                  and (r ->> 'today_remaining')::int = 2 and (r ->> 'today_concluded')::int = 1
                  and (r ->> 'month_concluded')::int >= 1
           from api.agenda_summary() r), 'cards de hoje: faltam 2, concluído 1, Check-in por estado');
select ok((select (r ->> 'no_document')::int = 2 from api.agenda_summary() r),
          'card sem documento usa a mesma regra do filtro');
create temp table livres_antes as select (r ->> 'month_free_slots')::int as n from api.agenda_summary() r;
select ok((select n >= 0 from livres_antes), 'horários livres no mês calculados no banco');
select pg_temp.pausa();
select ok((select (r ->> 'month_free_slots')::int from api.agenda_summary() r) < (select n from livres_antes),
          'a pausa do profissional sai dos horários livres (§10.2.2)');
select ok((select (r -> 'confirmation' ->> 'agendados')::int = 2 and (r -> 'confirmation' ->> 'a_confirmar')::int = 2
           from api.agenda_summary() r), 'Confirmação: os dois futuros dentro da janela de 72 h estão a confirmar');

-- janela de confirmação pela cascata: 24 h em consulta deixa o agendamento de daqui a ~2 dias fora da janela
select pg_temp.janela_consulta(24);
select is((select e ->> 'confirmation' from jsonb_array_elements(api.agenda_day(pg_temp.hora(2, 0)::date) -> 'data') e),
          'fora_da_janela', 'janela de 24 h em consulta: a consulta de daqui a 2 dias está fora da janela');
select throws_ok($$ select atta_in.confirm_appointment('00000000-0000-4000-8000-00000000a005') $$,
                 'P0001', 'ATTA-IN-0003', 'fora da janela do tipo de atendimento não se confirma');

-- Confirmar agendamento: só Agendado futuro dentro da janela; remarcar zera
select lives_ok($$ select atta_in.confirm_appointment('00000000-0000-4000-8000-00000000a004') $$,
                'confirmar o agendamento de amanhã (dentro da janela)');
select is((select (r -> 'confirmation' ->> 'confirmados')::int from api.agenda_summary() r), 1,
          'o card mostra o confirmado');
select throws_ok($$ select atta_in.confirm_appointment('00000000-0000-4000-8000-00000000a001') $$,
                 'P0001', 'ATTA-IN-0003', 'agendamento que já passou não se confirma');

-- isolamento e vínculo removido
select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'ADMIN');
select is((select jsonb_array_length(api.agenda_day() -> 'data')), 0, 'B não vê a agenda da A');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select pg_temp.remover_vinculo();
select throws_ok($$ select api.agenda_day() $$, '42501', 'ATTA-AUTH-0004', 'vínculo removido: não lê a agenda');

select * from finish();
rollback;
