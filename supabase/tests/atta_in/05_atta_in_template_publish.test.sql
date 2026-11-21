-- MIG-20 (parte 3): no ATTA-in, modelo só se publica com procedimento vivo vinculado (PDD v206 §10.3.1; ADR 0001
-- §1, decisão do Tech Lead no #67). Lista com allowed_actions do servidor. Só dado fictício.
begin;
select plan(26);

insert into platform.tenant (id, name) values
  ('00000000-0000-4000-8000-0000000000f1', 'Clínica Fictícia Publicação A'),
  ('00000000-0000-4000-8000-0000000000f2', 'Clínica Fictícia Publicação B');
insert into atta_in.clinic_service (id, tenant_id, name, duration_min) values
  ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000f1', 'Limpeza fictícia', 30),
  ('00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-0000000000f1', 'Serviço que vai ser apagado', 30);

create function pg_temp.entrar(p_tenant uuid, p_role text, p_aal text default 'aal2') returns void
language plpgsql as $$
declare
  v_user uuid;
  v_membership uuid;
begin
  perform set_config('role', 'postgres', true);
  if p_role = 'ADMIN' then   -- no máximo 2 ADMIN vivos (MIG-06 #54)
    select m.user_id into v_user from platform.membership m
    where m.tenant_id = p_tenant and m.app_role = 'ADMIN' and m.status = 'active' and m.deleted_at is null limit 1;
  end if;
  if v_user is null then
    v_user := gen_random_uuid();
    insert into auth.users (id, email) values (v_user, v_user::text || '@teste.invalid');
    insert into platform.membership (tenant_id, user_id, app_role) values (p_tenant, v_user, p_role)
    returning id into v_membership;
    if p_role = 'COLABORADOR' and to_regclass('platform.membership_permission') is not null then   -- matriz (#46)
      execute 'insert into platform.membership_permission (tenant_id, membership_id, module, action)
               select $1, $2, ''documents'', a from unnest(array[''view'', ''create'', ''edit'']) a
               on conflict do nothing'
        using p_tenant, v_membership;
    end if;
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'tenant_id', p_tenant, 'app_role', p_role,
      'aal', p_aal,
      'amr', json_build_array(json_build_object('method', 'password',
                                                'timestamp', extract(epoch from now())::bigint)))::text, true);
end $$;

create function pg_temp.modelo(p_title text) returns uuid language sql as $$
  select id from documents.template where title = p_title
$$;
create function pg_temp.acoes(p_title text) returns text language sql as $$
  select string_agg((a ->> 'action') || coalesce(':' || (a ->> 'disabled_reason'), ''), ',')
  from api.atta_in_template_list() l, jsonb_array_elements(l.allowed_actions) a where l.title = p_title
$$;
do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated', pg_my_temp_schema()::regnamespace);
end $$;

-- permissões --------------------------------------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'api.template_publish(uuid)', 'EXECUTE'),
          'o painel não chama mais a publicação genérica da plataforma');
select ok(not has_function_privilege('authenticated', 'private.template_publish_core(uuid)', 'EXECUTE')
          and not has_function_privilege('service_role', 'private.template_publish_core(uuid)', 'EXECUTE'),
          'o núcleo não tem EXECUTE para os papéis da API');
select ok(has_function_privilege('authenticated', 'api.atta_in_template_publish(uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'api.atta_in_template_publish(uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'api.atta_in_template_list()', 'EXECUTE'),
          'o painel publica e lista pelo invólucro do ATTA-in; anon não');

-- sem procedimento não publica ---------------------------------------------------------------------------------
select pg_temp.entrar('00000000-0000-4000-8000-0000000000f1', 'ADMIN');
insert into documents.template (kind, title, frequency, required, draft_body)
values ('tcle', 'TCLE fictício A', 'por_procedimento', true, 'Texto fictício do termo.');
select throws_ok($$ select api.template_publish(pg_temp.modelo('TCLE fictício A')) $$, '42501', null,
                 'chamar a publicação genérica direto é barrado');
select is(pg_temp.acoes('TCLE fictício A'), 'editar,vincular_procedimentos,publicar:service_ids',
          'rascunho sem procedimento: Publicar aparece desabilitado, com o motivo');
select throws_ok($$ select * from api.atta_in_template_publish(pg_temp.modelo('TCLE fictício A')) $$,
                 'P0001', 'ATTA-IN-0001', '§10.3.1: sem procedimento vinculado não publica');
select is((select count(*)::int from documents.template_version where template_id = pg_temp.modelo('TCLE fictício A')),
          0, 'nenhuma versão nasceu');

-- vínculo só com Serviço apagado também não vale -------------------------------------------------------------------
select api.template_set_services(pg_temp.modelo('TCLE fictício A'), array['00000000-0000-4000-8000-00000000c002']::uuid[]);
select set_config('role', 'postgres', true);
update atta_in.clinic_service set deleted_at = now() where id = '00000000-0000-4000-8000-00000000c002';
select pg_temp.entrar('00000000-0000-4000-8000-0000000000f1', 'ADMIN');
select throws_ok($$ select * from api.atta_in_template_publish(pg_temp.modelo('TCLE fictício A')) $$,
                 'P0001', 'ATTA-IN-0001', 'vínculo só com Serviço apagado não conta');
select is(pg_temp.acoes('TCLE fictício A'), 'editar,vincular_procedimentos,publicar:service_ids',
          'Serviço apagado não libera o Publicar na lista');

-- com procedimento vivo publica --------------------------------------------------------------------------------
select api.template_set_services(pg_temp.modelo('TCLE fictício A'), array['00000000-0000-4000-8000-00000000c001']::uuid[]);
select is(pg_temp.acoes('TCLE fictício A'), 'editar,vincular_procedimentos,publicar',
          'com procedimento vivo, Publicar fica liberado');
select results_eq($$ select version from api.atta_in_template_publish(pg_temp.modelo('TCLE fictício A')) $$,
                  $$ values (1) $$, 'publica a versão 1 pelo invólucro');
select is(pg_temp.acoes('TCLE fictício A'), 'editar,vincular_procedimentos,publicar,inativar',
          'Ativo: editar, vincular, publicar nova versão e inativar');
select is((select status || ' ' || current_version || ' ' || array_to_string(clinic_service_ids, ',')
           from api.atta_in_template_list() where title = 'TCLE fictício A'),
          'ativo 1 00000000-0000-4000-8000-00000000c001', 'a lista traz estado, versão e procedimentos');
select set_config('role', 'postgres', true);   -- vínculo antigo com Serviço que depois foi apagado
insert into atta_in.service_document_template (tenant_id, clinic_service_id, template_id)
values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000c002', pg_temp.modelo('TCLE fictício A'));
select pg_temp.entrar('00000000-0000-4000-8000-0000000000f1', 'ADMIN');
select is((select array_to_string(clinic_service_ids, ',') from api.atta_in_template_list() where title = 'TCLE fictício A'),
          '00000000-0000-4000-8000-00000000c001', 'com um vivo e um apagado, a lista traz só o Serviço vivo');
select set_config('role', 'postgres', true);   -- a trilha só se lê como dono
select is((select count(*)::int from audit.event e join documents.template_version v on v.id = e.entity_id
           where e.action = 'template.publish' and v.template_id = pg_temp.modelo('TCLE fictício A')), 1,
          'a publicação pelo invólucro deixa template.publish na trilha');
select pg_temp.entrar('00000000-0000-4000-8000-0000000000f1', 'ADMIN');

-- Termo de Autorização do profissional: não é de procedimento ------------------------------------------------------
select set_config('role', 'postgres', true);   -- Termo de Autorização: modelo de sistema, só pelo seed do dono (P2c)
insert into documents.template (tenant_id, kind, title, frequency, required, draft_body)
values ('00000000-0000-4000-8000-0000000000f1', 'termo_de_autorizacao', 'Termo de Autorização fictício', 'unica', true, 'Texto fictício da autorização.');
insert into documents.template_version (tenant_id, template_id, version, kind, title, frequency, required, body,
                                        body_sha256, published_by)
select t.tenant_id, t.id, 1, t.kind, t.title, t.frequency, t.required, t.draft_body,
       encode(sha256(convert_to(t.draft_body, 'UTF8')), 'hex'), gen_random_uuid()
from documents.template t where t.title = 'Termo de Autorização fictício';
update documents.template set status = 'ativo', current_version = 1 where title = 'Termo de Autorização fictício';
select pg_temp.entrar('00000000-0000-4000-8000-0000000000f1', 'ADMIN');
select is(pg_temp.acoes('Termo de Autorização fictício'), null,
          'Termo de Autorização (modelo de sistema, P2c): aparece na lista sem nenhuma ação');
select throws_ok($$ select * from api.atta_in_template_publish(pg_temp.modelo('Termo de Autorização fictício')) $$,
                 'P0001', 'ATTA-IN-0003', 'a clínica não publica o Termo de Autorização');

-- detail como nome de campo (ADR 0001 §5) --------------------------------------------------------------------------
select throws_like($$ update documents.template set kind = 'personalizado' where title = 'TCLE fictício A' $$,
                   'ATTA-IN-0002', 'tipo travado depois de publicado');
select set_config('teste.modelo', pg_temp.modelo('TCLE fictício A')::text, true);
select api.template_deactivate(current_setting('teste.modelo')::uuid);
select is(pg_temp.acoes('TCLE fictício A'), null, 'Inativo: nenhuma ação');
select throws_ok($$ select * from api.atta_in_template_publish(current_setting('teste.modelo')::uuid) $$,
                 'P0001', 'ATTA-IN-0002', 'Inativo não publica pelo invólucro');
create function pg_temp.detalhe(p_sql text) returns text language plpgsql as $$
declare d text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics d = pg_exception_detail;
  return d;
end $$;
grant execute on function pg_temp.detalhe(text) to authenticated;
select is(pg_temp.detalhe(format('select * from api.atta_in_template_publish(%L)', current_setting('teste.modelo'))),
          'status', 'Inativo sai com detail status');
select is(pg_temp.detalhe(format('select api.template_set_services(%L, %L)', current_setting('teste.modelo'),
                                 '{00000000-0000-4000-8000-00000000c001}')),
          'status', 'vínculo em Inativo sai com detail status');

-- papel e clínica ---------------------------------------------------------------------------------------------------
select pg_temp.entrar('00000000-0000-4000-8000-0000000000f1', 'ADMIN', 'aal1');
select throws_ok($$ select * from api.atta_in_template_list() $$, '42501', 'ATTA-AUTH-0004',
                 'ADMIN sem 2º fator não lista');
select pg_temp.entrar('00000000-0000-4000-8000-0000000000f2', 'ADMIN');
select is((select count(*)::int from api.atta_in_template_list()), 0, 'outra clínica não vê os modelos');
select throws_ok($$ select * from api.atta_in_template_publish(current_setting('teste.modelo')::uuid) $$,
                 'P0002', 'ATTA-CORE-0005', 'outra clínica publicando: "não encontrado", antes de olhar o vínculo');
select pg_temp.entrar('00000000-0000-4000-8000-0000000000f1', 'COLABORADOR');
select is((select count(*)::int from api.atta_in_template_list()), 2, 'Colaborador com Termos & Docs lista');

select * from finish();
rollback;
