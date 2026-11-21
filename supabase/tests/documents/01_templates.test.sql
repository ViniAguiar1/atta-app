-- MIG-20: Meus modelos versionados (PDD v206 §10.3.1, §17.2, §17.5; RN-DOC-01, RN-DOC-02, RN-DOC-04, RN-V-01).
-- Só dado fictício: clínicas, títulos e textos inventados.
begin;
select plan(53);

insert into platform.tenant (id, name) values
  ('00000000-0000-4000-8000-0000000000d1', 'Clínica Fictícia Documentos A'),
  ('00000000-0000-4000-8000-0000000000d2', 'Clínica Fictícia Documentos B');

create function pg_temp.entrar(p_tenant uuid, p_role text, p_aal text default 'aal2') returns void
language plpgsql as $$
declare
  v_user uuid;
  v_membership uuid;
begin
  perform set_config('role', 'postgres', true);
  -- no máximo 2 ADMIN vivos por clínica (PDD §10.4.3, MIG-06 #54): ADMIN reaproveita um ADMIN vivo desta clínica
  if p_role = 'ADMIN' then
    select m.user_id into v_user from platform.membership m
    where m.tenant_id = p_tenant and m.app_role = 'ADMIN' and m.status = 'active' and m.deleted_at is null
    limit 1;
  end if;
  if v_user is null then
    v_user := gen_random_uuid();
    insert into auth.users (id, email) values (v_user, v_user::text || '@teste.invalid');
    insert into platform.membership (tenant_id, user_id, app_role) values (p_tenant, v_user, p_role)
    returning id into v_membership;
    -- matriz do MIG-06 (#46): Termos & Docs não vem no padrão do COLABORADOR; o ADMIN libera ver, criar e editar
    if p_role = 'COLABORADOR' and to_regclass('platform.membership_permission') is not null then
      execute 'insert into platform.membership_permission (tenant_id, membership_id, module, action)
               select $1, $2, ''documents'', a from unnest(array[''view'', ''create'', ''edit'']) a
               on conflict do nothing'
        using p_tenant, v_membership;
    end if;
  end if;
  perform set_config('role', 'authenticated', true);
  -- ADMIN só com aal2 (MIG-03) e amr com a hora do login (sessão de 12 h, #35)
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'tenant_id', p_tenant, 'app_role', p_role,
      'aal', p_aal,
      'amr', json_build_array(json_build_object('method', 'password',
                                                'timestamp', extract(epoch from now())::bigint)))::text, true);
end $$;

create function pg_temp.remover_vinculo() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  update platform.membership set deleted_at = now()
  where user_id = (current_setting('request.jwt.claims')::jsonb ->> 'sub')::uuid;
  perform set_config('role', 'authenticated', true);
end $$;

create function pg_temp.dono() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.modelo(p_title text) returns uuid language sql as $$
  select id from documents.template where title = p_title
$$;

create function pg_temp.mudar_titulo(p_id uuid) returns int language plpgsql as $$
declare n int;
begin
  update documents.template set title = 'Título trocado por outra clínica' where id = p_id;
  get diagnostics n = row_count;
  return n;
end $$;

do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated', pg_my_temp_schema()::regnamespace);
end $$;
-- Este arquivo prova o núcleo da plataforma (publicar, versão, imutabilidade). Desde o MIG-20 parte 3, o painel do
-- ATTA-in publica pelo invólucro api.atta_in_template_publish (atta_in/05), e api.template_publish não tem EXECUTE
-- para authenticated; aqui, só dentro desta transação (rollback no fim), ele volta para testar o núcleo.
grant execute on function api.template_publish(uuid) to authenticated;

-- estrutura ---------------------------------------------------------------------------------------------------------
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'documents.template'::regclass),
          'template com RLS ligada e forçada');
select ok((select relrowsecurity and relforcerowsecurity from pg_class
           where oid = 'documents.template_version'::regclass), 'template_version com RLS ligada e forçada');
select ok(not has_table_privilege('anon', 'documents.template', 'SELECT'), 'anon não lê modelo');
select ok(not has_table_privilege('anon', 'documents.template_version', 'SELECT'), 'anon não lê versão');
select ok(not has_table_privilege('authenticated', 'documents.template_version', 'INSERT'),
          'a app não grava versão pela tabela (só pela publicação)');
select ok(not has_table_privilege('authenticated', 'documents.template_version', 'UPDATE'), 'a app não altera versão');
select ok(not has_table_privilege('authenticated', 'documents.template', 'DELETE'), 'a app não apaga modelo');
select ok(not has_column_privilege('authenticated', 'documents.template', 'status', 'UPDATE')
          and not has_column_privilege('authenticated', 'documents.template', 'current_version', 'UPDATE')
          and not has_column_privilege('authenticated', 'documents.template', 'tenant_id', 'INSERT'),
          'status, versão e clínica não se escrevem pela tabela');
select ok(not has_function_privilege('anon', 'api.template_publish(uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'api.template_deactivate(uuid)', 'EXECUTE'),
          'anon não publica nem inativa');
select results_eq(
  $$ select action, kind from audit.action where action in ('template.publish', 'template.deactivate') order by action $$,
  $$ values ('template.deactivate'::text, 'change'::text), ('template.publish', 'change') $$,
  'ações do modelo no catálogo da auditoria');

-- rascunho e regras de cadastro (ADMIN em aal2) ---------------------------------------------------------------------
select pg_temp.entrar('00000000-0000-4000-8000-0000000000d1', 'ADMIN');
select lives_ok(
  $$ insert into documents.template (kind, title, draft_body)
     values ('tcle', 'TCLE fictício de limpeza', e'  Termo fictício de consentimento.\r\nLinha dois.\r\n\n ') $$,
  'ADMIN cria rascunho incompleto (salvamento automático)');
select is((select status || ' ' || coalesce(current_version::text, '-') || ' ' ||
                  tenant_id::text from documents.template where title = 'TCLE fictício de limpeza'),
          'rascunho - 00000000-0000-4000-8000-0000000000d1', 'rascunho nasce na clínica do token, sem versão');
select throws_ok($$ select * from api.template_publish(pg_temp.modelo('TCLE fictício de limpeza')) $$,
                 'P0001', 'ATTA-IN-0001', 'sem frequência não publica');
update documents.template set frequency = 'por_procedimento' where title = 'TCLE fictício de limpeza';
select throws_ok($$ select * from api.template_publish(pg_temp.modelo('TCLE fictício de limpeza')) $$,
                 'P0001', 'ATTA-IN-0001', 'RN-DOC-04: sem obrigatório/opcional não publica (sem padrão)');
select throws_ok($$ update documents.template set validity_months = 6 where title = 'TCLE fictício de limpeza' $$,
                 '23514', null, 'RN-V-01: "Por procedimento" não tem validade');
select throws_ok($$ update documents.template set frequency = 'unica' where title = 'TCLE fictício de limpeza' $$,
                 '23514', null, '§17.2: TCLE é sempre "Por procedimento"');
select throws_ok($$ insert into documents.template (kind, title) values ('aviso_de_privacidade', 'Aviso fictício') $$,
                 '23514', null, 'RN-AVP-01: Aviso de Privacidade não é modelo da clínica');

-- publicação: versão 1, texto normalizado e hash ------------------------------------------------------------------
update documents.template set required = true where title = 'TCLE fictício de limpeza';
select results_eq(
  $$ select version, body_sha256 from api.template_publish(pg_temp.modelo('TCLE fictício de limpeza')) $$,
  $$ values (1, 'ece573e50a33fbeca7f1a35d603964d70ad747c997fbfa76457b39ba16beadf7'::text) $$,
  'publica a versão 1 com o sha256 do texto em nfc+lf+trim (calculado fora do banco)');
select is((select body from documents.template_version where template_id = pg_temp.modelo('TCLE fictício de limpeza')),
          e'Termo fictício de consentimento.\nLinha dois.', 'texto publicado em NFC, LF e sem espaço nas pontas');
select is((select kind || ' ' || frequency || ' ' || required::text || ' ' || body_normalization
           from documents.template_version where template_id = pg_temp.modelo('TCLE fictício de limpeza')),
          'tcle por_procedimento true nfc+lf+trim', 'a versão guarda tipo e regras vigentes');
select is((select status || ' ' || current_version from documents.template where title = 'TCLE fictício de limpeza'),
          'ativo 1', 'modelo fica Ativo na versão 1');
select throws_ok($$ select * from api.template_publish(pg_temp.modelo('TCLE fictício de limpeza')) $$,
                 'P0001', 'ATTA-IN-0002', 'sem mudança não nasce versão nova');

update documents.template set draft_body = e'Termo fictício de consentimento, versão 2.\nLinha dois.'
where title = 'TCLE fictício de limpeza';
select results_eq(
  $$ select version, body_sha256 from api.template_publish(pg_temp.modelo('TCLE fictício de limpeza')) $$,
  $$ values (2, 'e3af1f8752ad833dd4a90ad5405e2620bcfdf6c17e8f98d84b7c56b95c5f378f'::text) $$,
  'RN-DOC-01: editar e publicar cria a versão 2');
select is((select body from documents.template_version
           where template_id = pg_temp.modelo('TCLE fictício de limpeza') and version = 1),
          e'Termo fictício de consentimento.\nLinha dois.', 'a versão 1 continua igual e consultável');
select throws_ok($$ update documents.template set kind = 'consentimento_procedimento'
                    where title = 'TCLE fictício de limpeza' $$,
                 'P0001', 'ATTA-IN-0002', 'depois de publicado, o tipo não muda (vira document.type no ATTA Sign)');

-- Colaborador: módulo documents liberado no stub do MIG-06 ------------------------------------------------------
select pg_temp.entrar('00000000-0000-4000-8000-0000000000d1', 'COLABORADOR');
-- o Termo de Autorização de sistema (seed em toda clínica, MIG-21c) fica fora destas contagens
select is((select count(*)::int from documents.template_version where title <> 'Termo de Autorização de Uso de Imagem de Assinatura Digital'), 2, 'Colaborador da clínica vê as versões');
select lives_ok(
  $$ insert into documents.template (kind, title, frequency, validity_months, required, draft_body)
     values ('personalizado', 'Política fictícia da casa', 'unica', 12, false, 'Texto fictício da política.') $$,
  'Colaborador cria modelo personalizado "Única" com validade de 1 ano');
select lives_ok($$ select * from api.template_publish(pg_temp.modelo('Política fictícia da casa')) $$,
                'Colaborador publica');
select is((select validity_months::int from documents.template_version
           where template_id = pg_temp.modelo('Política fictícia da casa')), 12, 'validade copiada na versão');

-- isolamento e papel ------------------------------------------------------------------------------------------------
select set_config('teste.modelo_a', pg_temp.modelo('TCLE fictício de limpeza')::text, true);

select pg_temp.entrar('00000000-0000-4000-8000-0000000000d1', 'ADMIN', 'aal1');
select is((select count(*)::int from documents.template), 0, 'ADMIN sem 2º fator não vê modelos');
select throws_ok($$ select * from api.template_publish(current_setting('teste.modelo_a')::uuid) $$,
                 '42501', 'ATTA-AUTH-0004', 'ADMIN sem 2º fator não publica');

select pg_temp.entrar('00000000-0000-4000-8000-0000000000d2', 'ADMIN');
select is((select count(*)::int from documents.template where title <> 'Termo de Autorização de Uso de Imagem de Assinatura Digital'), 0, 'outra clínica não vê os modelos');
select is((select count(*)::int from documents.template_version where title <> 'Termo de Autorização de Uso de Imagem de Assinatura Digital'), 0, 'outra clínica não vê as versões');
select throws_ok($$ select * from api.template_publish(current_setting('teste.modelo_a')::uuid) $$,
                 'P0002', 'ATTA-CORE-0005', 'outra clínica publicando: "não encontrado"');
select throws_ok($$ select api.template_deactivate(current_setting('teste.modelo_a')::uuid) $$,
                 'P0002', 'ATTA-CORE-0005', 'outra clínica inativando: "não encontrado"');
select is(pg_temp.mudar_titulo(current_setting('teste.modelo_a')::uuid), 0, 'outra clínica não altera o modelo');
select throws_ok(
  $$ insert into documents.template (tenant_id, kind, title)
     values ('00000000-0000-4000-8000-0000000000d1', 'tcle', 'Modelo plantado') $$,
  '42501', null, 'ninguém escolhe a clínica do modelo');

select pg_temp.entrar('00000000-0000-4000-8000-0000000000d1', 'ADMIN');
select pg_temp.remover_vinculo();
select is((select count(*)::int from documents.template), 0, 'vínculo removido corta o acesso com o token ainda válido');

select pg_temp.dono();
select set_config('role', 'anon', true);
select throws_ok($$ select count(*) from documents.template $$, '42501', null, 'anon não lê modelo');

-- imutabilidade da versão, até para o dono ----------------------------------------------------------------------
select set_config('role', 'postgres', true);   -- anon não executa as funções do teste
select throws_ok($$ update documents.template_version set body = 'Texto adulterado.' where version = 1 $$,
                 'P0001', 'ATTA-IN-0002', 'versão publicada não muda (RN-DOC-01)');
select throws_ok($$ delete from documents.template_version where version = 1 $$,
                 'P0001', 'ATTA-IN-0002', 'versão publicada não sai');
select throws_ok($$ truncate documents.template_version cascade $$,
                 'P0001', 'ATTA-IN-0002', 'versão publicada não sai por TRUNCATE');
select throws_ok(
  $$ insert into documents.template_version (tenant_id, template_id, version, kind, title, frequency, required, body,
                                             body_sha256, published_by)
     values ('00000000-0000-4000-8000-0000000000d1', current_setting('teste.modelo_a')::uuid, 9, 'tcle', 'X',
             'por_procedimento', true, e'Texto com CR\r\nno meio.',
             encode(sha256(convert_to(e'Texto com CR\r\nno meio.', 'UTF8')), 'hex'), gen_random_uuid()) $$,
  '23514', null, 'versão fora de nfc+lf+trim é recusada');
select throws_ok(
  $$ insert into documents.template_version (tenant_id, template_id, version, kind, title, frequency, required, body,
                                             body_sha256, published_by)
     values ('00000000-0000-4000-8000-0000000000d1', current_setting('teste.modelo_a')::uuid, 9, 'tcle', 'X',
             'por_procedimento', true, 'Texto.', repeat('0', 64), gen_random_uuid()) $$,
  '23514', null, 'body_sha256 preso ao texto');

-- auditoria ---------------------------------------------------------------------------------------------------------
select is((select count(*)::int from audit.event e
           join documents.template_version v on v.id = e.entity_id
           where e.action = 'template.publish' and e.entity = 'documents.template_version'
             and e.tenant_id = '00000000-0000-4000-8000-0000000000d1'
             and e.details ->> 'template_id' = v.template_id::text and (e.details ->> 'version')::int = v.version),
          3, 'cada publicação deixa template.publish na trilha, com o id e o número da versão');

-- inativar ---------------------------------------------------------------------------------------------------------
select pg_temp.entrar('00000000-0000-4000-8000-0000000000d1', 'ADMIN');
select throws_ok($$ update documents.template set status = 'inativo' where title = 'TCLE fictício de limpeza' $$,
                 '42501', null, 'status não muda pela tabela');
select lives_ok($$ select api.template_deactivate(pg_temp.modelo('TCLE fictício de limpeza')) $$, 'ADMIN inativa');
select is((select status from documents.template where title = 'TCLE fictício de limpeza'), 'inativo',
          'modelo Inativo');
select is((select count(*)::int from documents.template_version
           where template_id = pg_temp.modelo('TCLE fictício de limpeza')), 2,
          'as versões continuam consultáveis depois de inativar');
select throws_ok($$ update documents.template set draft_body = 'Outro texto.' where title = 'TCLE fictício de limpeza' $$,
                 'P0001', 'ATTA-IN-0002', 'Inativo não aceita edição');
select throws_ok($$ select * from api.template_publish(pg_temp.modelo('TCLE fictício de limpeza')) $$,
                 'P0001', 'ATTA-IN-0002', 'Inativo não publica');
select throws_ok($$ select api.template_deactivate(pg_temp.modelo('TCLE fictício de limpeza')) $$,
                 'P0001', 'ATTA-IN-0002', 'Inativo não inativa de novo');

select pg_temp.dono();
select is((select count(*)::int from audit.event
           where action = 'template.deactivate' and entity_id = current_setting('teste.modelo_a')::uuid
             and before ->> 'status' = 'ativo' and after ->> 'status' = 'inativo'),
          1, 'inativar deixa template.deactivate na trilha, com antes e depois');

select * from finish();
rollback;
