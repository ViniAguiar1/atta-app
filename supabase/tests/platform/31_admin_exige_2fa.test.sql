-- ADMIN só com o segundo fator (aal2 no token), regra do dono (20/11): sem ele, has_permission nega tudo, inclusive
-- na Data API direta. O COLABORADOR não precisa do segundo fator. Só dados fictícios.
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated;
select plan(6);

-- hora do login no token (MIG-03: sessão de no máximo 12 h; sem amr, has_permission nega)
create function pg_temp.com_login(c text) returns text language sql as $$
  select (c::jsonb || jsonb_build_object('amr', jsonb_build_array(jsonb_build_object('method', 'password',
    'timestamp', extract(epoch from now())::bigint))))::text
$$;
grant execute on function pg_temp.com_login(text) to authenticated;

insert into auth.users (id, email, aud, role) values
  ('a1a1a1a1-0000-4000-8000-0000000000a1', 'admin2fa@exemplo.test', 'authenticated', 'authenticated'),
  ('c1c1c1c1-0000-4000-8000-0000000000c1', 'colab2fa@exemplo.test', 'authenticated', 'authenticated');
insert into platform.tenant (id, name) values ('aaaaaaaa-0000-4000-8000-000000000001', 'Clínica Alfa Ficticia');
insert into platform.membership (tenant_id, user_id, app_role) values ('aaaaaaaa-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-0000000000a1', 'ADMIN'), ('aaaaaaaa-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-0000000000c1', 'COLABORADOR');

set local role authenticated;
select set_config('request.jwt.claims', pg_temp.com_login('{"sub":"a1a1a1a1-0000-4000-8000-0000000000a1","role":"authenticated","tenant_id":"aaaaaaaa-0000-4000-8000-000000000001","app_role":"ADMIN","aal":"aal1"}'), true);
select is(private.has_permission('team', 'view'), false, 'ADMIN sem o segundo fator (aal1): sem permissão');
select is((select count(*)::int from platform.membership), 1, 'ADMIN com aal1 vê só o próprio vínculo, não a equipe');
select set_config('request.jwt.claims', pg_temp.com_login('{"sub":"a1a1a1a1-0000-4000-8000-0000000000a1","role":"authenticated","tenant_id":"aaaaaaaa-0000-4000-8000-000000000001","app_role":"ADMIN","aal":"aal2"}'), true);
select is(private.has_permission('team', 'view'), true, 'ADMIN com o segundo fator (aal2): permissão de ADMIN');
select is((select count(*)::int from platform.membership), 2, 'ADMIN com aal2 vê a equipe');
select set_config('request.jwt.claims', pg_temp.com_login('{"sub":"c1c1c1c1-0000-4000-8000-0000000000c1","role":"authenticated","tenant_id":"aaaaaaaa-0000-4000-8000-000000000001","app_role":"COLABORADOR","aal":"aal1"}'), true);
select is(private.has_permission('appointments', 'view'), true, 'COLABORADOR não precisa do segundo fator');
select set_config('request.jwt.claims', pg_temp.com_login('{"sub":"a1a1a1a1-0000-4000-8000-0000000000a1","role":"authenticated","tenant_id":"aaaaaaaa-0000-4000-8000-000000000001","app_role":"ADMIN"}'), true);
select is(private.has_permission('team', 'view'), false, 'token de ADMIN sem o claim aal: tratado como aal1');
reset role;

select * from finish();
rollback;
