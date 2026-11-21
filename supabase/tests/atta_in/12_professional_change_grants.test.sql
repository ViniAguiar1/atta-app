-- MIG-13 (S2 da Segurança no #304): trocar o profissional revoga os links do profissional anterior naquele atendimento.
-- Dados fictícios.
begin;
select plan(8);

insert into platform.tenant (id, name) values ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A');
insert into network.person (id, full_name, cpf_hmac, cpf_masked, cpf_enc, dek_wrapped, kek_version)
values ('00000000-0000-4000-8000-0000000000e1', 'Paciente Fictícia', sha256('cpf-e1'::bytea), '···.···.247-25', '\x01', '\x01', 1);
insert into network.person_tenant_link (tenant_id, person_id)
values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000e1');
insert into platform.professional (id, display_name, council, council_uf, council_number, cpf_hmac, cpf_masked, cpf_enc,
                                   email_enc, dek_wrapped, kek_version, council_status, council_verified_at)
values ('00000000-0000-4000-8000-0000000000f1', 'Dra. Fictícia Um', 'cro', 'SP', '11111', sha256('cpf-p1'::bytea),
        '···.···.000-01', '\x01', '\x01', '\x01', 1, 'regularizado', now()),
       ('00000000-0000-4000-8000-0000000000f2', 'Dr. Fictício Dois', 'cro', 'SP', '22222', sha256('cpf-p2'::bytea),
        '···.···.000-02', '\x01', '\x01', '\x01', 1, 'regularizado', now());
insert into platform.professional_tenant_link (id, tenant_id, professional_id, invite_email_hmac, invite_email_enc,
                                               envelope_id, dek_wrapped, kek_version, propass_completed_at)
values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000f1',
        sha256('p1@a.test'::bytea), '\x01', gen_random_uuid(), '\x01', 1, now()),
       ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000f2',
        sha256('p2@a.test'::bytea), '\x01', gen_random_uuid(), '\x01', 1, now());

create function pg_temp.entrar(p_tenant uuid, p_role text) returns void language plpgsql as $$
declare
  v_user uuid := gen_random_uuid();
begin
  perform set_config('role', 'postgres', true);
  insert into auth.users (id, email) values (v_user, v_user::text || '@teste.invalid');
  insert into platform.membership (tenant_id, user_id, app_role) values (p_tenant, v_user, p_role);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'tenant_id', p_tenant, 'app_role', p_role,
                      'aal', case when p_role = 'ADMIN' then 'aal2' else 'aal1' end,
                      'amr', json_build_array(json_build_object('method', 'password',
                                                                'timestamp', extract(epoch from now())::bigint)))::text, true);
end $$;
create function pg_temp.agendar(p_id uuid, p_dias int) returns void language sql security definer as $$
  insert into atta_in.appointment (id, tenant_id, person_id, professional_link_id, appointment_type, modality, starts_at, ends_at)
  values (p_id, '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000e1',
          '00000000-0000-4000-8000-0000000000d1', 'consulta', 'presencial',
          now() + make_interval(days => p_dias), now() + make_interval(days => p_dias) + interval '1 hour')
$$;
create function pg_temp.link_profissional(p_appointment uuid, p_link uuid, p_segredo text) returns void
language sql security definer as $$
  insert into platform.access_grant (purpose, tenant_id, professional_link_id, appointment_id, secret_hash, expires_at, sent_at)
  values ('professional_boarding', '00000000-0000-4000-8000-00000000000a', p_link, p_appointment,
          sha256(p_segredo::bytea), now() + interval '8 hours', now())
$$;
create function pg_temp.link_paciente(p_appointment uuid) returns void language sql security definer as $$
  insert into platform.access_grant (purpose, tenant_id, person_id, appointment_id, secret_hash, expires_at)
  values ('patient_checkin', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000e1', p_appointment,
          sha256(('paciente-' || p_appointment)::bytea), now() + interval '30 minutes')
$$;
create function pg_temp.vivo(p_segredo text) returns boolean language sql security definer as $$
  select revoked_at is null from platform.access_grant where secret_hash = sha256(p_segredo::bytea)
$$;
create function pg_temp.paciente_vivo(p_appointment uuid) returns boolean language sql security definer as $$
  select revoked_at is null from platform.access_grant where appointment_id = p_appointment and purpose = 'patient_checkin'
$$;
create function pg_temp.revogacoes() returns int language sql security definer as $$
  select count(*)::int from audit.event where action = 'grant.revoke' and details ->> 'reason' = 'professional_change'
$$;

do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated', pg_my_temp_schema()::regnamespace);
end $$;

-- dois agendamentos da Dra. Um amanhã; links do Boarding Check dela nos dois e o check-in da paciente no primeiro
select pg_temp.agendar('00000000-0000-4000-8000-00000000a001', 1);
select pg_temp.agendar('00000000-0000-4000-8000-00000000a002', 2);
select pg_temp.link_profissional('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-0000000000d1', 'um-a001');
select pg_temp.link_profissional('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-0000000000d1', 'um-a002');
select pg_temp.link_paciente('00000000-0000-4000-8000-00000000a001');

-- a recepção troca o profissional do primeiro pelo painel
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select lives_ok($$ update atta_in.appointment set professional_link_id = '00000000-0000-4000-8000-0000000000d2'
                   where id = '00000000-0000-4000-8000-00000000a001' $$, 'trocar o profissional de um Agendado');
select ok(not pg_temp.vivo('um-a001'), 'o link do profissional anterior naquele atendimento é revogado na mesma transação');
select ok(pg_temp.vivo('um-a002'), 'o link do mesmo profissional em outro atendimento continua');
select ok(pg_temp.paciente_vivo('00000000-0000-4000-8000-00000000a001'),
          'o check-in da paciente continua (não é do profissional)');
select is(pg_temp.revogacoes(), 1, 'a revogação vai para a trilha grant.revoke com o motivo professional_change');

-- mexer em outra coisa não revoga; voltar para a Dra. Um revoga o link do Dr. Dois
select pg_temp.link_profissional('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-0000000000d2', 'dois-a001');
update atta_in.appointment set starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour'
where id = '00000000-0000-4000-8000-00000000a001';
select ok(pg_temp.vivo('dois-a001'), 'remarcar sem trocar o profissional não revoga o link dele');
update atta_in.appointment set professional_link_id = '00000000-0000-4000-8000-0000000000d1'
where id = '00000000-0000-4000-8000-00000000a001';
select ok(not pg_temp.vivo('dois-a001') and pg_temp.revogacoes() = 2, 'voltar para a Dra. Um revoga o link do Dr. Dois');

-- só o profissional atual mantém o link: um link de outro profissional que tenha sobrado também cai na troca
select pg_temp.link_profissional('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-0000000000d2', 'dois-a002');
update atta_in.appointment set professional_link_id = '00000000-0000-4000-8000-0000000000d2'
where id = '00000000-0000-4000-8000-00000000a002';
select ok(not pg_temp.vivo('um-a002') and pg_temp.vivo('dois-a002'),
          'na troca, cai todo link que não é do profissional novo; o dele continua');

select * from finish();
rollback;
