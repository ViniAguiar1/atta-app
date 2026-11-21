-- MIG-20 (parte 4): excluir Serviço que é o único procedimento de termo Ativo é recusado. Decisão do dono (PLANO,
-- R15); trava da ADR 0001 §1. Só dado fictício.
begin;
select plan(22);

insert into platform.tenant (id, name) values
  ('00000000-0000-4000-8000-0000000000a6', 'Clínica Fictícia Exclusão A'),
  ('00000000-0000-4000-8000-0000000000b6', 'Clínica Fictícia Exclusão B');
insert into atta_in.clinic_service (id, tenant_id, name, duration_min) values
  ('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-0000000000a6', 'Serviço só do termo único', 30),
  ('00000000-0000-4000-8000-00000000d002', '00000000-0000-4000-8000-0000000000a6', 'Serviço do termo duplo 1', 30),
  ('00000000-0000-4000-8000-00000000d003', '00000000-0000-4000-8000-0000000000a6', 'Serviço do termo duplo 2', 30),
  ('00000000-0000-4000-8000-00000000d004', '00000000-0000-4000-8000-0000000000a6', 'Serviço de rascunho e inativo', 30),
  ('00000000-0000-4000-8000-00000000d005', '00000000-0000-4000-8000-0000000000a6', 'Serviço do Termo de Autorização', 30),
  ('00000000-0000-4000-8000-00000000d006', '00000000-0000-4000-8000-0000000000a6', 'Serviço sem termo', 30);

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
create function pg_temp.novo(p_kind text, p_title text, p_freq text, p_servicos uuid[], p_publicar boolean) returns void
language plpgsql as $$
begin
  insert into documents.template (kind, title, frequency, required, draft_body)
  values (p_kind, p_title, p_freq, true, 'Texto fictício de ' || p_title || '.');
  perform api.template_set_services(pg_temp.modelo(p_title), p_servicos);
  if p_publicar then
    perform api.atta_in_template_publish(pg_temp.modelo(p_title));
  end if;
end $$;
create function pg_temp.excluir(p_id uuid) returns int language plpgsql as $$
declare n int;
begin
  update atta_in.clinic_service set deleted_at = now() where id = p_id;
  get diagnostics n = row_count;
  return n;
end $$;
do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated', pg_my_temp_schema()::regnamespace);
end $$;

-- estrutura ---------------------------------------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'private.clinic_service_guard_delete()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'private.service_delete_blockers(uuid, uuid)', 'EXECUTE'),
          'gatilho e regra sem EXECUTE para os papéis da API');
select ok(has_function_privilege('authenticated', 'api.atta_in_service_delete_blockers(uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'api.atta_in_service_delete_blockers(uuid)', 'EXECUTE'),
          'a leitura dos termos que travam é do painel, não do anon');

-- cenário: termo Ativo com 1 Serviço, termo Ativo com 2, Rascunho e Inativo no mesmo Serviço, Termo de Autorização
select pg_temp.entrar('00000000-0000-4000-8000-0000000000a6', 'ADMIN');
select pg_temp.novo('tcle', 'TCLE único', 'por_procedimento', array['00000000-0000-4000-8000-00000000d001']::uuid[], true);
select pg_temp.novo('tcle', 'TCLE duplo', 'por_procedimento',
                    array['00000000-0000-4000-8000-00000000d002', '00000000-0000-4000-8000-00000000d003']::uuid[], true);
select pg_temp.novo('personalizado', 'Rascunho fictício', 'unica', array['00000000-0000-4000-8000-00000000d004']::uuid[], false);
select pg_temp.novo('personalizado', 'Inativo fictício', 'unica', array['00000000-0000-4000-8000-00000000d004']::uuid[], true);
select api.template_deactivate(pg_temp.modelo('Inativo fictício'));
select set_config('role', 'postgres', true);   -- Termo de Autorização: modelo de sistema, só pelo seed do dono (P2c)
insert into documents.template (tenant_id, kind, title, frequency, required, draft_body)
values ('00000000-0000-4000-8000-0000000000a6', 'termo_de_autorizacao', 'Termo de Autorização fictício', 'unica', true, 'Texto fictício da autorização.');
insert into documents.template_version (tenant_id, template_id, version, kind, title, frequency, required, body,
                                        body_sha256, published_by)
select t.tenant_id, t.id, 1, t.kind, t.title, t.frequency, t.required, t.draft_body,
       encode(sha256(convert_to(t.draft_body, 'UTF8')), 'hex'), gen_random_uuid()
from documents.template t where t.title = 'Termo de Autorização fictício';
update documents.template set status = 'ativo', current_version = 1 where title = 'Termo de Autorização fictício';
-- vínculo plantado: a função de vínculo não aceita o Termo de Autorização
insert into atta_in.service_document_template (tenant_id, clinic_service_id, template_id)
values ('00000000-0000-4000-8000-0000000000a6', '00000000-0000-4000-8000-00000000d005',
        pg_temp.modelo('Termo de Autorização fictício'));
select pg_temp.entrar('00000000-0000-4000-8000-0000000000a6', 'ADMIN');

-- leitura dos termos que travam -----------------------------------------------------------------------------------
select results_eq($$ select title from api.atta_in_service_delete_blockers('00000000-0000-4000-8000-00000000d001') $$,
                  $$ values ('TCLE único'::text) $$, 'a leitura lista o termo que ficaria sem procedimento');
select is((select count(*)::int from api.atta_in_service_delete_blockers('00000000-0000-4000-8000-00000000d002')), 0,
          'termo com outro Serviço vivo não trava');

-- recusa com 1 vínculo; passa com outro Serviço vivo --------------------------------------------------------------
select throws_ok($$ select pg_temp.excluir('00000000-0000-4000-8000-00000000d001') $$, 'P0001', 'ATTA-IN-0004',
                 'R15: excluir o único procedimento de um termo Ativo é recusado');
select is((select deleted_at from atta_in.clinic_service where id = '00000000-0000-4000-8000-00000000d001'), null,
          'o Serviço continua vivo');
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
select is(pg_temp.detalhe($$ select pg_temp.excluir('00000000-0000-4000-8000-00000000d001') $$), 'clinic_service_id',
          'detail é o nome do campo');
select is(pg_temp.excluir('00000000-0000-4000-8000-00000000d002'), 1, 'termo com outro Serviço vivo: a exclusão passa');

-- dois Serviços do mesmo termo em sequência: o segundo é recusado ------------------------------------------------
select throws_ok($$ select pg_temp.excluir('00000000-0000-4000-8000-00000000d003') $$, 'P0001', 'ATTA-IN-0004',
                 'o segundo Serviço do mesmo termo agora é o único: recusado');
select results_eq($$ select title from api.atta_in_service_delete_blockers('00000000-0000-4000-8000-00000000d003') $$,
                  $$ values ('TCLE duplo'::text) $$, 'e a leitura passa a listar esse termo');

-- Rascunho, Inativo e Termo de Autorização não travam; Serviço sem termo e desativar também passam -------------
select is(pg_temp.excluir('00000000-0000-4000-8000-00000000d004'), 1, 'Serviço só de Rascunho e de Inativo: passa');
select is(pg_temp.excluir('00000000-0000-4000-8000-00000000d005'), 1, 'o Termo de Autorização fica de fora da regra');
select is(pg_temp.excluir('00000000-0000-4000-8000-00000000d006'), 1, 'Serviço sem termo: passa');
update atta_in.clinic_service set deleted_at = '2001-01-01T00:00:00Z' where id = '00000000-0000-4000-8000-00000000d002';
select ok((select deleted_at = now() from atta_in.clinic_service where id = '00000000-0000-4000-8000-00000000d002'),
          'reexcluir mantém a hora da primeira exclusão');
select set_config('role', 'postgres', true);
update atta_in.clinic_service set deleted_at = null where id = '00000000-0000-4000-8000-00000000d006';
select pg_temp.entrar('00000000-0000-4000-8000-0000000000a6', 'ADMIN');
update atta_in.clinic_service set deleted_at = '2001-01-01T00:00:00Z' where id = '00000000-0000-4000-8000-00000000d006';
select ok((select deleted_at = now() from atta_in.clinic_service where id = '00000000-0000-4000-8000-00000000d006'),
          'a hora da exclusão vem do banco, não do valor que o app manda');
select lives_ok($$ update atta_in.clinic_service set active = false where id = '00000000-0000-4000-8000-00000000d001' $$,
                'desativar o Serviço (active = false) fica fora da regra');
select lives_ok($$ update atta_in.clinic_service set name = 'Nome fictício trocado'
                   where id = '00000000-0000-4000-8000-00000000d001' $$,
                'outras mudanças no Serviço não passam pela trava');

-- permissão e clínica -----------------------------------------------------------------------------------------------
select throws_ok($$ select * from api.atta_in_service_delete_blockers('00000000-0000-4000-8000-00000000d006') $$,
                 'P0002', 'ATTA-CORE-0005', 'Serviço já excluído: "não encontrado"');
select pg_temp.entrar('00000000-0000-4000-8000-0000000000a6', 'COLABORADOR');
select throws_ok($$ select * from api.atta_in_service_delete_blockers('00000000-0000-4000-8000-00000000d001') $$,
                 '42501', 'ATTA-AUTH-0004', 'sem settings.edit não lê');
select pg_temp.entrar('00000000-0000-4000-8000-0000000000a6', 'ADMIN', 'aal1');
select throws_ok($$ select * from api.atta_in_service_delete_blockers('00000000-0000-4000-8000-00000000d001') $$,
                 '42501', 'ATTA-AUTH-0004', 'ADMIN sem 2º fator não lê');
select pg_temp.entrar('00000000-0000-4000-8000-0000000000b6', 'ADMIN');
select throws_ok($$ select * from api.atta_in_service_delete_blockers('00000000-0000-4000-8000-00000000d001') $$,
                 'P0002', 'ATTA-CORE-0005', 'Serviço de outra clínica: "não encontrado"');
select is(pg_temp.excluir('00000000-0000-4000-8000-00000000d001'), 0, 'outra clínica não exclui o Serviço (RLS)');

select * from finish();
rollback;
