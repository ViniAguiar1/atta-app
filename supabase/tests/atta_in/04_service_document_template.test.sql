-- MIG-20 (parte 2): vínculo modelo × procedimento (PDD v206 §10.3.1, §10.2.1, §10.4.7). Só dado fictício.
begin;
select plan(24);

insert into platform.tenant (id, name) values
  ('00000000-0000-4000-8000-0000000000e1', 'Clínica Fictícia Vínculo A'),
  ('00000000-0000-4000-8000-0000000000e2', 'Clínica Fictícia Vínculo B');
insert into atta_in.clinic_service (id, tenant_id, name, duration_min) values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-0000000000e1', 'Limpeza fictícia', 30),
  ('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-0000000000e1', 'Clareamento fictício', 60),
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-0000000000e2', 'Serviço da outra clínica', 30);
insert into atta_in.clinic_service (id, tenant_id, name, duration_min, deleted_at) values
  ('00000000-0000-4000-8000-00000000a009', '00000000-0000-4000-8000-0000000000e1', 'Serviço apagado', 30, now());

create function pg_temp.entrar(p_tenant uuid, p_role text, p_aal text default 'aal2') returns void
language plpgsql as $$
declare
  v_user uuid;
  v_membership uuid;
begin
  perform set_config('role', 'postgres', true);
  -- no máximo 2 ADMIN vivos por clínica (MIG-06 #54): ADMIN reaproveita um ADMIN vivo desta clínica
  if p_role = 'ADMIN' then
    select m.user_id into v_user from platform.membership m
    where m.tenant_id = p_tenant and m.app_role = 'ADMIN' and m.status = 'active' and m.deleted_at is null limit 1;
  end if;
  if v_user is null then
    v_user := gen_random_uuid();
    insert into auth.users (id, email) values (v_user, v_user::text || '@teste.invalid');
    insert into platform.membership (tenant_id, user_id, app_role) values (p_tenant, v_user, p_role)
    returning id into v_membership;
    -- matriz do MIG-06 (#46): Termos & Docs não vem no padrão do COLABORADOR
    if p_role = 'COLABORADOR' and to_regclass('platform.membership_permission') is not null then
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
create function pg_temp.vinculos(p_template uuid) returns text language sql as $$
  select coalesce(string_agg(right(clinic_service_id::text, 4), ',' order by clinic_service_id), '-')
  from atta_in.service_document_template where template_id = p_template
$$;
do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated', pg_my_temp_schema()::regnamespace);
end $$;

-- estrutura ---------------------------------------------------------------------------------------------------------
select ok((select relrowsecurity and relforcerowsecurity from pg_class
           where oid = 'atta_in.service_document_template'::regclass), 'vínculo com RLS ligada e forçada');
select ok(not has_table_privilege('authenticated', 'atta_in.service_document_template', 'INSERT')
          and not has_table_privilege('authenticated', 'atta_in.service_document_template', 'DELETE')
          and not has_table_privilege('anon', 'atta_in.service_document_template', 'SELECT'),
          'vínculo só se grava por função; anon não lê');
select ok(not has_function_privilege('anon', 'api.template_set_services(uuid, uuid[])', 'EXECUTE'),
          'anon não grava vínculo');

-- rascunho pode ficar sem procedimento; publicado precisa de um ou mais -------------------------------------------
select pg_temp.entrar('00000000-0000-4000-8000-0000000000e1', 'ADMIN');
insert into documents.template (kind, title, frequency, required, draft_body)
values ('tcle', 'TCLE fictício de limpeza', 'por_procedimento', true, 'Texto fictício do termo.');
select is(api.template_set_services(pg_temp.modelo('TCLE fictício de limpeza'),
                                    array['00000000-0000-4000-8000-00000000a001']::uuid[]), 1,
          'ADMIN vincula o termo a um procedimento (1 : 1, o recomendado)');
select is(pg_temp.vinculos(pg_temp.modelo('TCLE fictício de limpeza')), 'a001', 'vínculo gravado');
select is(api.template_set_services(pg_temp.modelo('TCLE fictício de limpeza'), '{}'), 0,
          'rascunho pode ficar sem procedimento');
select is(api.template_set_services(pg_temp.modelo('TCLE fictício de limpeza'),
          array['00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000a001',
                '00000000-0000-4000-8000-00000000a001']::uuid[]), 2, 'N:N, repetido conta uma vez');
select lives_ok($$ select * from api.atta_in_template_publish(pg_temp.modelo('TCLE fictício de limpeza')) $$, 'publica');
select throws_ok($$ select api.template_set_services(pg_temp.modelo('TCLE fictício de limpeza'), '{}') $$,
                 'P0001', 'ATTA-IN-0001', '§10.3.1: modelo Ativo precisa de pelo menos um procedimento');
select is(api.template_set_services(pg_temp.modelo('TCLE fictício de limpeza'),
                                    array['00000000-0000-4000-8000-00000000a002']::uuid[]), 1,
          'troca o conjunto inteiro numa chamada');
select is(pg_temp.vinculos(pg_temp.modelo('TCLE fictício de limpeza')), 'a002', 'só o novo procedimento ficou');

-- Serviço da outra clínica, apagado ou inexistente ---------------------------------------------------------------
select throws_ok($$ select api.template_set_services(pg_temp.modelo('TCLE fictício de limpeza'),
                    array['00000000-0000-4000-8000-00000000b001']::uuid[]) $$,
                 'P0002', 'ATTA-CORE-0005', 'Serviço de outra clínica: "não encontrado"');
select throws_ok($$ select api.template_set_services(pg_temp.modelo('TCLE fictício de limpeza'),
                    array['00000000-0000-4000-8000-00000000a009']::uuid[]) $$,
                 'P0002', 'ATTA-CORE-0005', 'Serviço apagado não recebe vínculo');
select is(pg_temp.vinculos(pg_temp.modelo('TCLE fictício de limpeza')), 'a002', 'a tentativa recusada não mexeu em nada');

-- Termo de Autorização não é de procedimento ------------------------------------------------------------------------
select set_config('role', 'postgres', true);   -- Termo de Autorização: modelo de sistema, só pelo seed do dono (P2c)
select set_config('request.jwt.claims', '', true);   -- o seed roda sem usuário no token
insert into documents.template (tenant_id, kind, title, frequency, required, draft_body)
values ('00000000-0000-4000-8000-0000000000e1', 'termo_de_autorizacao', 'Termo de Autorização fictício', 'unica', true, 'Texto fictício da autorização.');
insert into documents.template_version (tenant_id, template_id, version, kind, title, frequency, required, body,
                                        body_sha256, published_by)
select t.tenant_id, t.id, 1, t.kind, t.title, t.frequency, t.required, t.draft_body,
       encode(sha256(convert_to(t.draft_body, 'UTF8')), 'hex'), gen_random_uuid()
from documents.template t where t.title = 'Termo de Autorização fictício';
update documents.template set status = 'ativo', current_version = 1 where title = 'Termo de Autorização fictício';
select pg_temp.entrar('00000000-0000-4000-8000-0000000000e1', 'ADMIN');
select throws_ok($$ select api.template_set_services(pg_temp.modelo('Termo de Autorização fictício'),
                    array['00000000-0000-4000-8000-00000000a001']::uuid[]) $$,
                 'P0001', 'ATTA-IN-0001', 'Termo de Autorização do profissional não se vincula a procedimento');

-- quem lê: Termos & Docs e Agendamentos (o modal pré-marca os documentos, §10.2.1) --------------------------------
select set_config('teste.modelo', pg_temp.modelo('TCLE fictício de limpeza')::text, true);
select pg_temp.entrar('00000000-0000-4000-8000-0000000000e1', 'COLABORADOR');
select is((select count(*)::int from atta_in.service_document_template), 1, 'Colaborador da clínica vê o vínculo');

select pg_temp.entrar('00000000-0000-4000-8000-0000000000e1', 'ADMIN', 'aal1');
select is((select count(*)::int from atta_in.service_document_template), 0, 'ADMIN sem 2º fator não vê');
select throws_ok($$ select api.template_set_services(current_setting('teste.modelo')::uuid,
                    array['00000000-0000-4000-8000-00000000a001']::uuid[]) $$,
                 '42501', 'ATTA-AUTH-0004', 'ADMIN sem 2º fator não grava');

select pg_temp.entrar('00000000-0000-4000-8000-0000000000e2', 'ADMIN');
select is((select count(*)::int from atta_in.service_document_template), 0, 'outra clínica não vê o vínculo');
select throws_ok($$ select api.template_set_services(current_setting('teste.modelo')::uuid,
                    array['00000000-0000-4000-8000-00000000b001']::uuid[]) $$,
                 'P0002', 'ATTA-CORE-0005', 'outra clínica gravando no modelo: "não encontrado"');

-- Inativo não muda; FK composta impede vínculo cruzado mesmo para o dono ------------------------------------------
select pg_temp.entrar('00000000-0000-4000-8000-0000000000e1', 'ADMIN');
select api.template_deactivate(current_setting('teste.modelo')::uuid);
select throws_ok($$ select api.template_set_services(current_setting('teste.modelo')::uuid,
                    array['00000000-0000-4000-8000-00000000a001']::uuid[]) $$,
                 'P0001', 'ATTA-IN-0002', 'modelo Inativo não muda de procedimento');

select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', '', true);
select throws_ok($$ insert into atta_in.service_document_template (tenant_id, clinic_service_id, template_id)
                    values ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-00000000b001',
                            current_setting('teste.modelo')::uuid) $$,
                 '23503', null, 'FK composta: modelo de uma clínica não se liga a Serviço de outra');

-- auditoria ---------------------------------------------------------------------------------------------------------
select is((select count(*)::int from audit.event
           where action = 'template.services_set' and entity_id = current_setting('teste.modelo')::uuid), 4,
          'cada mudança real deixa template.services_set na trilha (a lista igual não grava)');
select is((select after -> 'clinic_service_ids' from audit.event
           where action = 'template.services_set' and entity_id = current_setting('teste.modelo')::uuid
           order by seq desc limit 1),
          '["00000000-0000-4000-8000-00000000a002"]'::jsonb, 'o depois guarda só os ids dos procedimentos');

select * from finish();
rollback;
