-- MIG-11 (a): horário de funcionamento, Serviços, Serviços autorizados e datas específicas (dados fictícios).
begin;
select plan(19);

insert into platform.tenant (id, name) values
  ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A'),
  ('00000000-0000-4000-8000-00000000000b', 'Clínica Fictícia B');
-- vínculo fictício nascido no convite (a agenda se configura antes do PROpass, ADR 0001 §1)
insert into platform.professional_tenant_link (id, tenant_id, invite_email_hmac, invite_email_enc, envelope_id,
                                               dek_wrapped, kek_version)
values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000000a', sha256('dra@a.test'::bytea),
        '\x01', gen_random_uuid(), '\x01', 1);
insert into atta_in.clinic_service (id, tenant_id, name, duration_min) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000000a', 'Limpeza de Pele Fictícia', 60),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-00000000000b', 'Serviço da B', 30);

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
create function pg_temp.eventos() returns int language sql security definer as $$
  select count(*)::int from audit.event where action = 'special_date.change'
$$;

create function pg_temp.remover_vinculo() returns void language plpgsql as $$
begin
  -- o vínculo sai do banco, mas o token continua válido (regra da ADR 0001 §2, revisão do MIG-02)
  perform set_config('role', 'postgres', true);
  update platform.membership set deleted_at = now()
  where user_id = (current_setting('request.jwt.claims')::jsonb ->> 'sub')::uuid;
  perform set_config('role', 'authenticated', true);
end $$;

do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated',
                 pg_my_temp_schema()::regnamespace);
end $$;

do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated',
                 pg_my_temp_schema()::regnamespace);
end $$;

select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'atta_in' and c.relname in ('business_hours', 'clinic_service', 'professional_service',
                                                         'special_date')
             and c.relrowsecurity and c.relforcerowsecurity), 4, 'as 4 tabelas com RLS forçada');

-- ADMIN configura
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select lives_ok($$ insert into atta_in.business_hours (tenant_id, weekday, starts_at, ends_at)
                   values ('00000000-0000-4000-8000-00000000000a', 1, '08:00', '18:00') $$, 'horário de segunda');
select throws_ok($$ insert into atta_in.business_hours (tenant_id, weekday, starts_at, ends_at)
                    values ('00000000-0000-4000-8000-00000000000a', 7, '08:00', '18:00') $$, '23514', null,
                 'dia da semana fora de 0 a 6');
select throws_ok($$ insert into atta_in.clinic_service (tenant_id, name, duration_min)
                    values ('00000000-0000-4000-8000-00000000000a', 'limpeza de pele fictícia ', 30) $$, '23505', null,
                 'nome de Serviço repetido na clínica (sem diferenciar maiúsculas)');
select throws_ok($$ insert into atta_in.clinic_service (tenant_id, name, duration_min)
                    values ('00000000-0000-4000-8000-00000000000a', 'Rápido', 2) $$, '23514', null,
                 'duração abaixo de 5 min');
select lives_ok($$ insert into atta_in.professional_service (tenant_id, professional_link_id, clinic_service_id)
                   values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000d1',
                           '00000000-0000-4000-8000-0000000000c1') $$, 'Serviço autorizado ao profissional');
select throws_ok($$ insert into atta_in.professional_service (tenant_id, professional_link_id, clinic_service_id)
                    values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000d1',
                            '00000000-0000-4000-8000-0000000000c2') $$, '23503', null,
                 'Serviço de outra clínica não se autoriza');
select throws_ok($$ select atta_in.set_setting('janela_de_confirmacao_h', '24', null,
                    '00000000-0000-4000-8000-0000000000c2') $$, '23503', null,
                 'exceção de configuração para Serviço de outra clínica é recusada (FK)');

-- datas específicas
select lives_ok($$ insert into atta_in.special_date (tenant_id, starts_on, ends_on, name, kind)
                   values ('00000000-0000-4000-8000-00000000000a', '2026-12-24', '2026-12-26', 'Recesso', 'clinica_fechada') $$,
                'clínica fechada num período');
select throws_ok($$ insert into atta_in.special_date (tenant_id, starts_on, ends_on, name, kind)
                    values ('00000000-0000-4000-8000-00000000000a', '2026-12-01', '2026-12-01', 'Férias', 'profissional_ausente') $$,
                 '23514', null, 'profissional ausente sem profissional é recusado');
select throws_ok($$ insert into atta_in.special_date (tenant_id, starts_on, ends_on, name, kind)
                    values ('00000000-0000-4000-8000-00000000000a', '2026-12-01', '2026-12-01',
                            'Nome comprido demais para caber nos quarenta', 'lembrete') $$, '23514', null,
                 'nome acima de 40 caracteres');
select is(pg_temp.eventos(), 1, 'a criação de data específica vai para a auditoria');

-- Colaborador: vê e cadastra data específica (agenda), mas não muda horário nem Serviço
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'COLABORADOR');
select is((select count(*)::int from atta_in.clinic_service), 1, 'Colaborador vê os Serviços');
select lives_ok($$ insert into atta_in.special_date (tenant_id, starts_on, ends_on, name, kind, professional_link_id)
                   values ('00000000-0000-4000-8000-00000000000a', '2026-12-01', '2026-12-05', 'Férias',
                           'profissional_ausente', '00000000-0000-4000-8000-0000000000d1') $$,
                'Colaborador cadastra profissional ausente');
select throws_ok($$ insert into atta_in.business_hours (tenant_id, weekday, starts_at, ends_at)
                    values ('00000000-0000-4000-8000-00000000000a', 2, '08:00', '18:00') $$, '42501', null,
                 'Colaborador não muda o horário de funcionamento');

-- B não vê nada da A
select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'ADMIN');
select is((select count(*)::int from atta_in.special_date), 0, 'B não vê as datas da A');
select is((select string_agg(name, ',') from atta_in.clinic_service), 'Serviço da B', 'B vê só os Serviços dela');

-- vínculo removido com o token ainda válido: nada (ADR 0001 §2)
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select pg_temp.remover_vinculo();
select is((select count(*)::int from atta_in.clinic_service), 0, 'vínculo removido: o ADMIN não vê os Serviços');
select throws_ok($$ insert into atta_in.special_date (tenant_id, starts_on, ends_on, name, kind)
                    values ('00000000-0000-4000-8000-00000000000a', '2026-12-31', '2026-12-31', 'Fim', 'lembrete') $$,
                 '42501', null, 'vínculo removido: o ADMIN não grava data específica');

select * from finish();
rollback;
