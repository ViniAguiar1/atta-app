-- MIG-20 (parte 6): a lista traz a regra da versão vigente ao lado da do rascunho (PDD v206 RN-DOC-01, RN-DOC-04).
-- Só dado fictício.
begin;
select plan(7);

insert into platform.tenant (id, name) values ('00000000-0000-4000-8000-0000000009a1', 'Clínica Fictícia Vigente');
insert into atta_in.clinic_service (id, tenant_id, name, duration_min)
values ('00000000-0000-4000-8000-0000000091a1', '00000000-0000-4000-8000-0000000009a1', 'Serviço fictício', 30);

create function pg_temp.entrar(p_tenant uuid) returns void language plpgsql as $$
declare v_user uuid;
begin
  perform set_config('role', 'postgres', true);
  select m.user_id into v_user from platform.membership m
  where m.tenant_id = p_tenant and m.app_role = 'ADMIN' and m.status = 'active' and m.deleted_at is null limit 1;
  if v_user is null then
    v_user := gen_random_uuid();
    insert into auth.users (id, email) values (v_user, v_user::text || '@teste.invalid');
    insert into platform.membership (tenant_id, user_id, app_role) values (p_tenant, v_user, 'ADMIN');
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'tenant_id', p_tenant, 'app_role', 'ADMIN', 'aal', 'aal2',
      'amr', json_build_array(json_build_object('method', 'password',
                                                'timestamp', extract(epoch from now())::bigint)))::text, true);
end $$;
create function pg_temp.modelo(p_title text) returns uuid language sql as $$
  select id from documents.template where title = p_title
$$;
create function pg_temp.regra(p_title text) returns text language sql as $$
  select concat_ws(' | ', required, frequency, validity_months, '/', current_required, current_frequency,
                   current_validity_months)
  from api.atta_in_template_list() where title = p_title
$$;
do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated', pg_my_temp_schema()::regnamespace);
end $$;

select pg_temp.entrar('00000000-0000-4000-8000-0000000009a1');
insert into documents.template (kind, title, frequency, validity_months, required, draft_body) values
  ('personalizado', 'Política fictícia', 'unica', 6, true, 'Texto fictício da política.'),
  ('tcle', 'Rascunho fictício', 'por_procedimento', null, true, 'Texto fictício do rascunho.');
select api.template_set_services(pg_temp.modelo('Política fictícia'), array['00000000-0000-4000-8000-0000000091a1']::uuid[]);
select api.atta_in_template_publish(pg_temp.modelo('Política fictícia'));

select is(pg_temp.regra('Política fictícia'), 't | unica | 6 | / | t | unica | 6',
          'recém-publicado: rascunho e versão vigente iguais');

-- o rascunho do Ativo é editado e não publicado: a regra que vale continua a da versão
update documents.template set required = false, validity_months = 12 where title = 'Política fictícia';
select is(pg_temp.regra('Política fictícia'), 'f | unica | 12 | / | t | unica | 6',
          'Ativo com rascunho editado: required e validade do rascunho mudam, os current_* continuam os da versão');
select is((select current_required from api.atta_in_template_list() where title = 'Política fictícia'), true,
          'RN-DOC-04: obrigatório pela versão vigente até publicar a nova');

-- publicada a versão 2, a vigente acompanha
select api.atta_in_template_publish(pg_temp.modelo('Política fictícia'));
select is(pg_temp.regra('Política fictícia'), 'f | unica | 12 | / | f | unica | 12',
          'depois de publicar, a vigente passa a ser a nova');

-- Rascunho nunca publicado: sem versão vigente
select is((select current_required is null and current_frequency is null and current_validity_months is null
           from api.atta_in_template_list() where title = 'Rascunho fictício'), true, 'Rascunho: current_* nulos');

-- Inativo: a vigente continua a última publicada
select api.template_deactivate(pg_temp.modelo('Política fictícia'));
select is((select current_required from api.atta_in_template_list() where title = 'Política fictícia'), false,
          'Inativo: current_* da última versão publicada');
select is((select count(*)::int from api.atta_in_template_list()), 2, 'as linhas não mudam');

select * from finish();
rollback;
