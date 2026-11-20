-- Sessão de no máximo 12 h desde o login (PDD v206 §19.8; ADR 0006): has_permission nega quando o login mais antigo de
-- amr passou de 12 h, também na Data API direta. Só dados fictícios.
begin;
create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to authenticated;
select plan(6);

insert into auth.users (id, email, aud, role) values
  ('a1a1a1a1-0000-4000-8000-0000000000a1', 'admin12h@exemplo.test', 'authenticated', 'authenticated');
insert into platform.tenant (id, name) values ('aaaaaaaa-0000-4000-8000-000000000001', 'Clínica Alfa');
insert into platform.membership (tenant_id, user_id, app_role)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-0000000000a1', 'ADMIN');

create function pg_temp.token(p_login_ha interval) returns text language sql as $$
  select json_build_object('sub', 'a1a1a1a1-0000-4000-8000-0000000000a1', 'role', 'authenticated',
    'tenant_id', 'aaaaaaaa-0000-4000-8000-000000000001', 'app_role', 'ADMIN', 'aal', 'aal2',
    'amr', json_build_array(
      json_build_object('method', 'password', 'timestamp', extract(epoch from now() - p_login_ha)::bigint),
      json_build_object('method', 'totp', 'timestamp', extract(epoch from now() - interval '1 minute')::bigint)))::text
$$;
grant execute on function pg_temp.token(interval) to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', pg_temp.token(interval '1 hour'), true);
select is(private.has_permission('team', 'view'), true, 'login de 1 h: permissão normal');
select set_config('request.jwt.claims', pg_temp.token(interval '11 hours 59 minutes'), true);
select is(private.has_permission('team', 'view'), true, 'login de 11 h 59 min: ainda vale');
select set_config('request.jwt.claims', pg_temp.token(interval '12 hours 1 minute'), true);
select is(private.has_permission('team', 'view'), false, 'login de 12 h 1 min: recusado (vale o login mais antigo do amr)');
select is((select count(*)::int from platform.membership), 1, 'login de 12 h 1 min: a equipe some, só o próprio vínculo');
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-4000-8000-0000000000a1","role":"authenticated","tenant_id":"aaaaaaaa-0000-4000-8000-000000000001","app_role":"ADMIN","aal":"aal2","amr":[{"method":"password","timestamp":"nao-numero"}]}', true);
select is(private.has_permission('team', 'view'), false, 'timestamp malformado no amr: sem hora de login, sem permissão');
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-4000-8000-0000000000a1","role":"authenticated","tenant_id":"aaaaaaaa-0000-4000-8000-000000000001","app_role":"ADMIN","aal":"aal2"}', true);
select is(private.has_permission('team', 'view'), false, 'token sem amr: falha fechada, sem permissão');
reset role;

select * from finish();
rollback;
