-- MIG-14a (2): horários e pausas do profissional (dados fictícios).
begin;
select plan(16);

insert into platform.tenant (id, name) values
  ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A'),
  ('00000000-0000-4000-8000-00000000000b', 'Clínica Fictícia B');
insert into platform.professional (id, display_name, council, council_uf, council_number)
values ('00000000-0000-4000-8000-0000000000f1', 'Dra. Fictícia', 'cro', 'SP', '12345'),
       ('00000000-0000-4000-8000-0000000000f2', 'Dr. Simulado', 'crm', 'RJ', '999');
insert into platform.professional_tenant_link (tenant_id, professional_id)
values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000f1'),
       ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000f2');

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
create function pg_temp.remover_vinculo() returns void language plpgsql as $$
begin
  -- o vínculo sai do banco, mas o token continua válido (regra da ADR 0001 §2, revisão do MIG-02)
  perform set_config('role', 'postgres', true);
  update platform.membership set deleted_at = now()
  where user_id = (current_setting('request.jwt.claims')::jsonb ->> 'sub')::uuid;
  perform set_config('role', 'authenticated', true);
end $$;
create function pg_temp.trilha() returns text language sql security definer as $$
  select string_agg(details ->> 'op', ',' order by created_at) from audit.event where action = 'professional_schedule.change'
$$;

do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated',
                 pg_my_temp_schema()::regnamespace);
end $$;

select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'atta_in.professional_schedule'::regclass),
          'horários com RLS forçada');

select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select lives_ok($$ insert into atta_in.professional_schedule (tenant_id, professional_id, weekdays, starts_at, ends_at)
                   values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000f1', '{1,2,3,4,5}',
                           '09:00', '18:00') $$, 'Seg a Sex · 09:00 às 18:00');
select throws_ok($$ insert into atta_in.professional_schedule (tenant_id, professional_id, weekdays, starts_at, ends_at)
                    values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000f1', '{6}',
                            '09:00', '12:00') $$, '23505', null, 'um horário por profissional na clínica');
select throws_ok($$ update atta_in.professional_schedule set weekdays = '{}' $$, '23514', null,
                 'pelo menos um dia é obrigatório');
select throws_ok($$ update atta_in.professional_schedule set ends_at = '08:00' $$, '23514', null,
                 'o fim precisa ser depois do início');
select throws_ok($$ update atta_in.professional_schedule set weekdays = '{1,7}' $$, '23514', null,
                 'dia fora de 0 a 6 é recusado');
select lives_ok($$ update atta_in.professional_schedule set ends_at = '17:00' $$, 'ajuste do horário');
select lives_ok($$ insert into atta_in.professional_break (tenant_id, professional_id, weekdays, starts_at, ends_at)
                   values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000f1', '{1,2,3,4,5}',
                           '12:00', '13:00') $$, 'pausa de almoço');
select throws_ok($$ insert into atta_in.professional_schedule (tenant_id, professional_id, weekdays, starts_at, ends_at)
                    values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000f2', '{1}',
                            '09:00', '10:00') $$, '23503', null, 'profissional sem vínculo com a clínica é recusado');
select is(pg_temp.trilha(), 'insert,update', 'cada alteração do horário vai para a auditoria');

-- Colaborador vê, mas não muda; a B não vê nem muda o da A
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'COLABORADOR');
select is((select count(*)::int from atta_in.professional_schedule), 1, 'Colaborador vê os horários (agenda)');
select throws_ok($$ insert into atta_in.professional_break (tenant_id, professional_id, weekdays, starts_at, ends_at)
                    values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000f1', '{1}',
                            '15:00', '15:30') $$, '42501', null, 'Colaborador não muda horário');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'ADMIN');
select is((select count(*)::int from atta_in.professional_schedule), 0, 'B não vê os horários da A');
select throws_ok($$ insert into atta_in.professional_break (tenant_id, professional_id, weekdays, starts_at, ends_at)
                    values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000f1', '{1}',
                            '15:00', '15:30') $$, '42501', null, 'B não grava na agenda da A');

-- vínculo removido com o token ainda válido: nada (ADR 0001 §2)
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select pg_temp.remover_vinculo();
select is((select count(*)::int from atta_in.professional_schedule), 0, 'vínculo removido: o ADMIN não vê os horários');
select throws_ok($$ insert into atta_in.professional_break (tenant_id, professional_id, weekdays, starts_at, ends_at)
                    values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000f1', '{1}',
                            '15:00', '15:30') $$, '42501', null, 'vínculo removido: o ADMIN não grava horário');

select * from finish();
rollback;
