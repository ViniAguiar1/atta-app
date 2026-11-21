-- MIG-12: api.patient_count, o total de pacientes ativos sem linha e sem trilha. Dados fictícios.
begin;
select plan(6);

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
    '···.···.' || right(p_cpf, 6), '\x01aa'::bytea, p_dek_wrapped => '\x01cc', p_kek_version => 1::smallint)
$$;
create function pg_temp.eventos() returns int language sql security definer as $$
  select count(*)::int from audit.event where tenant_id = '00000000-0000-4000-8000-00000000000a'
$$;

do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated', pg_my_temp_schema()::regnamespace);
end $$;

select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select pg_temp.cadastrar('00000000-0000-4000-8000-0000000000e1', 'Ana Fictícia', '52998224725');
select pg_temp.cadastrar('00000000-0000-4000-8000-0000000000e2', 'Bruno Fictício', '11144477735');
select pg_temp.cadastrar('00000000-0000-4000-8000-0000000000e3', 'Carla Fictícia', '39053344705');
select api.patient_set_archived('00000000-0000-4000-8000-0000000000e3', true);

select is(api.patient_count(), 2, 'conta os pacientes ativos da clínica, sem o arquivado');
select is(api.patient_count(), (select distinct total_active from api.patient_list()), 'o mesmo total_active da lista');
create temp table antes as select pg_temp.eventos() as n;
select api.patient_count();
select is(pg_temp.eventos(), (select n from antes), 'contar não grava leitura na trilha');

select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'COLABORADOR');
select is(api.patient_count(), 2, 'o Colaborador também conta (Pacientes é dele)');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'ADMIN');
select is(api.patient_count(), 0, 'B não conta os pacientes da A');
select pg_temp.entrar(null, null);
select throws_ok($$ select api.patient_count() $$, '42501', 'ATTA-AUTH-0004', 'sem clínica: recusado');

select * from finish();
rollback;
