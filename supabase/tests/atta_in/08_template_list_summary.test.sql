-- MIG-20 (parte 5): lista de Meus modelos com nomes dos procedimentos, data da versão e assinados, e o resumo do topo
-- (captura 39 do simulador; PDD v206 §10.3.1, §17.5, §18.5). Só dado fictício.
begin;
select plan(13);

insert into platform.tenant (id, name) values
  ('00000000-0000-4000-8000-0000000008a1', 'Clínica Fictícia Resumo A'),
  ('00000000-0000-4000-8000-0000000008b1', 'Clínica Fictícia Resumo B');
insert into atta_in.clinic_service (id, tenant_id, name, duration_min) values
  ('00000000-0000-4000-8000-0000000081a1', '00000000-0000-4000-8000-0000000008a1', 'Toxina fictícia', 30),
  ('00000000-0000-4000-8000-0000000081a2', '00000000-0000-4000-8000-0000000008a1', 'Preenchimento fictício', 30),
  ('00000000-0000-4000-8000-0000000081a3', '00000000-0000-4000-8000-0000000008a1', 'Serviço que vai sair', 30);
insert into network.person (id, full_name, is_incomplete) values ('00000000-0000-4000-8000-0000000082a1', 'Paciente Ficticio', true);
insert into network.person_tenant_link (tenant_id, person_id)
values ('00000000-0000-4000-8000-0000000008a1', '00000000-0000-4000-8000-0000000082a1');

create function pg_temp.entrar(p_tenant uuid, p_role text, p_aal text default 'aal2') returns void
language plpgsql as $$
declare
  v_user uuid;
  v_membership uuid;
begin
  perform set_config('role', 'postgres', true);
  if p_role = 'ADMIN' then   -- no máximo 2 ADMIN vivos (MIG-06)
    select m.user_id into v_user from platform.membership m
    where m.tenant_id = p_tenant and m.app_role = 'ADMIN' and m.status = 'active' and m.deleted_at is null limit 1;
  end if;
  if v_user is null then
    v_user := gen_random_uuid();
    insert into auth.users (id, email) values (v_user, v_user::text || '@teste.invalid');
    insert into platform.membership (tenant_id, user_id, app_role) values (p_tenant, v_user, p_role)
    returning id into v_membership;
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'tenant_id', p_tenant, 'app_role', p_role, 'aal', p_aal,
      'amr', json_build_array(json_build_object('method', 'password',
                                                'timestamp', extract(epoch from now())::bigint)))::text, true);
end $$;
create function pg_temp.modelo(p_title text) returns uuid language sql as $$
  select id from documents.template where title = p_title
$$;
create function pg_temp.payload() returns bytea language sql as $$
  select convert_to('{"atta_sign_version":"1","document":{"template_version":1,"type":"tcle"},'
    || '"signature":{"level":"atta_sign","signed_at":"2026-11-20T14:05:09.412Z"},'
    || '"tenant":{"legal_name":"Clinica Ficticia Ltda","trade_name":"Clinica Ficticia"}}', 'UTF8')
$$;
do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated', pg_my_temp_schema()::regnamespace);
end $$;

-- três modelos: Ativo obrigatório com 2 procedimentos vivos (e 1 que sai), Ativo opcional, Rascunho
select pg_temp.entrar('00000000-0000-4000-8000-0000000008a1', 'ADMIN');
insert into documents.template (kind, title, frequency, required, draft_body) values
  ('tcle', 'TCLE fictício', 'por_procedimento', true, 'Texto fictício do TCLE.'),
  ('autorizacao_uso_imagem', 'Imagem fictícia', 'por_procedimento', false, 'Texto fictício da imagem.'),
  ('personalizado', 'Rascunho fictício', 'unica', true, 'Texto fictício do rascunho.');
select api.template_set_services(pg_temp.modelo('TCLE fictício'), array['00000000-0000-4000-8000-0000000081a1',
  '00000000-0000-4000-8000-0000000081a2', '00000000-0000-4000-8000-0000000081a3']::uuid[]);
select api.template_set_services(pg_temp.modelo('Imagem fictícia'), array['00000000-0000-4000-8000-0000000081a1']::uuid[]);
select api.atta_in_template_publish(pg_temp.modelo('TCLE fictício'));
select api.atta_in_template_publish(pg_temp.modelo('Imagem fictícia'));

-- um Serviço sai, e três documentos do TCLE ganham evidência: um fica Pré-assinado (atendimento aberto), um vira
-- Assinado definitivo e um é cancelado. Só o definitivo (ou substituído) conta como assinado (§10.2.3, §17.6).
select set_config('role', 'postgres', true);
update atta_in.clinic_service set deleted_at = now() where id = '00000000-0000-4000-8000-0000000081a3';
insert into documents.document (id, tenant_id, template_version_id, person_id, folder_section)
select d.id, '00000000-0000-4000-8000-0000000008a1', v.id, '00000000-0000-4000-8000-0000000082a1', 'termos'
from documents.template_version v,
     (values ('00000000-0000-4000-8000-0000000083a1'::uuid), ('00000000-0000-4000-8000-0000000083a2'),
             ('00000000-0000-4000-8000-0000000083a3')) d (id)
where v.template_id = pg_temp.modelo('TCLE fictício');
update documents.document set status = 'pre_assinado'
where id in ('00000000-0000-4000-8000-0000000083a1', '00000000-0000-4000-8000-0000000083a2',
             '00000000-0000-4000-8000-0000000083a3');
insert into documents.evidence (tenant_id, document_id, atta_sign_version, payload_canonical, evidence_sha256, atta_code,
                                signed_at)
select '00000000-0000-4000-8000-0000000008a1', x.doc, '1', pg_temp.payload(), encode(sha256(pg_temp.payload()), 'hex'),
       x.code, '2026-11-20T14:05:09.412Z'
from (values ('00000000-0000-4000-8000-0000000083a1'::uuid, 'ATTA-3M7K-QPX9-4BD2'),
             ('00000000-0000-4000-8000-0000000083a2', 'ATTA-5N8P-2QRT-7VWX'),
             ('00000000-0000-4000-8000-0000000083a3', 'ATTA-6H9J-3KMN-8PQR')) x (doc, code);
update documents.document set status = 'assinado_definitivo' where id = '00000000-0000-4000-8000-0000000083a2';
update documents.document set status = 'cancelado', cancel_reason = 'paciente_desistiu', cancelled_at = now()
where id = '00000000-0000-4000-8000-0000000083a3';
select pg_temp.entrar('00000000-0000-4000-8000-0000000008a1', 'ADMIN');

-- lista ---------------------------------------------------------------------------------------------------------------
select is((select clinic_services from api.atta_in_template_list() where title = 'TCLE fictício'),
          '[{"id": "00000000-0000-4000-8000-0000000081a2", "name": "Preenchimento fictício"},
            {"id": "00000000-0000-4000-8000-0000000081a1", "name": "Toxina fictícia"}]'::jsonb,
          'chips: id e nome dos Serviços vivos, pelo nome (o que saiu não aparece)');
select is((select clinic_services from api.atta_in_template_list() where title = 'Rascunho fictício'), '[]'::jsonb,
          'sem procedimento: lista vazia, nunca nulo');
select is((select current_version_published_at from api.atta_in_template_list() where title = 'TCLE fictício'), now(),
          'data de publicação da versão atual');
select is((select current_version_published_at from api.atta_in_template_list() where title = 'Rascunho fictício'),
          null::timestamptz, 'Rascunho: sem data de versão');
select is((select signed_count from api.atta_in_template_list() where title = 'TCLE fictício'), 1,
          'assinados: só o Assinado definitivo; o Pré-assinado e o cancelado com evidência não contam');
select is((select signed_count from api.atta_in_template_list() where title = 'Imagem fictícia'), 0, 'sem assinatura: 0');
-- o Termo de Autorização de sistema (seed em toda clínica, MIG-21c) é um termo Ativo e obrigatório: entra nos cartões
select is((select count(*)::int from api.atta_in_template_list() where title <> 'Termo de Autorização de Uso de Imagem de Assinatura Digital'), 3, 'as colunas antigas continuam (3 modelos)');

-- resumo --------------------------------------------------------------------------------------------------------------
select results_eq(
  $$ select active_count, active_required_count, active_optional_count, expiring_count, expired_count, signed_count,
            signed_atta_sign_count from api.atta_in_template_summary() $$,
  $$ values (3, 2, 1, null::integer, null::integer, 1, 1) $$,
  'cartões: 3 ativos com o Termo de Autorização de sistema (2 obrigatórios, 1 opcional), vencendo/vencidos nulos até a PO (R17), 1 assinado (só o definitivo) com ATTA Sign');

-- permissões e clínica ----------------------------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'api.atta_in_template_summary()', 'EXECUTE')
          and not has_function_privilege('anon', 'api.atta_in_template_summary()', 'EXECUTE')
          and not has_function_privilege('anon', 'api.atta_in_template_list()', 'EXECUTE'),
          'painel chama; anon não');
select pg_temp.entrar('00000000-0000-4000-8000-0000000008a1', 'ADMIN', 'aal1');
select throws_ok($$ select * from api.atta_in_template_summary() $$, '42501', 'ATTA-AUTH-0004', 'ADMIN sem 2º fator');
select pg_temp.entrar('00000000-0000-4000-8000-0000000008b1', 'ADMIN');
select results_eq($$ select active_count, signed_count from api.atta_in_template_summary() $$, $$ values (1, 0) $$,
                  'outra clínica: só o próprio Termo de Autorização de sistema, não vê os números da primeira');
select is((select count(*)::int from api.atta_in_template_list() where title <> 'Termo de Autorização de Uso de Imagem de Assinatura Digital'), 0, 'outra clínica: lista vazia');
select set_config('role', 'anon', true);
select throws_ok($$ select * from api.atta_in_template_summary() $$, '42501', null, 'anon barrado');

select * from finish();
rollback;
