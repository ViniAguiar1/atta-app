-- MIG-14b (3): passo 2 (identidade, sem oráculo) e PIN do reaproveitado, sobre o cenário do 41_propass. Antes: (PDD v206 §10.4.3; ADR 0004 §3). Dados fictícios: bytes e nomes inventados.
begin;
select plan(17);

insert into platform.tenant (id, name, legal_name, cnpj) values
  ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A', 'Clínica Fictícia A Ltda', '00000000004101'),
  ('00000000-0000-4000-8000-00000000000b', 'Clínica Fictícia B', 'Clínica Fictícia B Ltda', '00000000004102'),
  ('00000000-0000-4000-8000-00000000000c', 'Clínica Fictícia C', 'Clínica Fictícia C Ltda', '00000000004103'),
  ('00000000-0000-4000-8000-00000000000d', 'Clínica Fictícia D', 'Clínica Fictícia D Ltda', '00000000004104');

create function pg_temp.entrar(p_tenant uuid, p_role text) returns void language plpgsql as $$
declare
  v_user uuid := gen_random_uuid();
begin
  perform set_config('role', 'postgres', true);
  insert into auth.users (id, email) values (v_user, v_user::text || '@teste.invalid');
  -- no máximo 2 ADMIN vivos por clínica (MIG-06, PDD §10.4.3): o ADMIN que já existe é reaproveitado
  if p_role = 'ADMIN' and exists (select 1 from platform.membership m where m.tenant_id = p_tenant
                                  and m.app_role = 'ADMIN' and m.deleted_at is null) then
    select m.user_id into v_user from platform.membership m where m.tenant_id = p_tenant and m.app_role = 'ADMIN'
      and m.deleted_at is null order by m.created_at limit 1;
  else
    insert into platform.membership (tenant_id, user_id, app_role) values (p_tenant, v_user, p_role);
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'tenant_id', p_tenant, 'app_role', p_role,
                      'aal', case when p_role = 'ADMIN' then 'aal2' else 'aal1' end,
                      'amr', json_build_array(json_build_object('method', 'password',
                                                                'timestamp', extract(epoch from now())::bigint)))::text, true);
end $$;

-- o servidor do Next, com o cliente admin (sem JWT de staff)
create function pg_temp.servidor() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'service_role', true);
end $$;

create function pg_temp.convidar(p_id uuid, p_email text, p_segredo text) returns uuid language sql as $$
  select api.professional_invite(p_id, sha256(p_email::bytea), ('\x01' || encode(p_email::bytea, 'hex'))::bytea,
                                 gen_random_uuid(), '\x01cc', 1::smallint, sha256(p_segredo::bytea))
$$;

-- chave do selo fictícia (o servidor confere a assinatura Ed25519; o banco confere o kid e a validade)
insert into documents.seal_key (kid, public_key_spki, valid_from)
values ('staging-seal-teste-propass', '\x302a300506032b6570032100'::bytea || sha256('chave-ficticia-propass'::bytea), '2026-01-01');

-- o que o servidor manda no envio final: os dados cifrados, o pin_mac e o pacote do ATTA Sign do Termo de Autorização,
-- montado sobre o modelo de sistema da clínica (seed, Backend 3). p_codigo troca o Código ATTA (pacote com defeito).
create function pg_temp.enviar(p_segredo text, p_email text, p_cpf text, p_numero text,
                               p_conselho text default 'regularizado', p_nome text default null,
                               p_aviso text default 'v1', p_codigo text default null) returns text
language plpgsql security definer as $$
declare
  v_link uuid; v_tenant uuid; v_doc uuid := gen_random_uuid(); v_payload bytea; tv record;
begin
  select g.professional_link_id, g.tenant_id into v_link, v_tenant from platform.access_grant g
  where g.secret_hash = sha256(p_segredo::bytea);
  select * into tv from documents.template_version t
  where t.tenant_id = v_tenant and t.kind = 'termo_de_autorizacao' order by t.version desc limit 1;
  v_payload := convert_to(jsonb_build_object(
    'atta_sign_version', '1',
    'document', jsonb_build_object('id', v_doc, 'type', 'termo_de_autorizacao', 'template_id', tv.template_id,
                                   'template_version', tv.version, 'body_sha256', tv.body_sha256,
                                   'body_normalization', tv.body_normalization),
    -- a clínica do payload é a do cadastro (ADR 0001, "Dados da clínica e texto do Termo")
    'tenant', (select jsonb_build_object('legal_name', c.legal_name, 'trade_name', c.name, 'cnpj', c.cnpj)
               from platform.tenant c where c.id = v_tenant),
    -- o registro do signatário confere com o profissional do envio (MIG-21c parte 2, Segurança no #208)
    'parties', jsonb_build_array(jsonb_build_object('ref', 'p1', 'role', 'professional',
                                                    'name', coalesce(p_nome, 'Dra. Fictícia ' || p_numero),
                                                    'council', 'CRO-SP ' || p_numero)),
    'signature', jsonb_build_object('signer', 'p1', 'level', 'atta_sign',
                                    'signed_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                                    'stroke_sha256', repeat('a', 64)),
    'context', jsonb_build_object('product', 'atta_in', 'context_type', 'professional_authorization', 'context_id', v_link)
  )::text, 'UTF8');
  return api.propass_submit(sha256(p_segredo::bytea), gen_random_uuid(), coalesce(p_nome, 'Dra. Fictícia ' || p_numero),
    'cro', 'SP', p_numero, sha256(p_cpf::bytea), '···.···.000-00', '\x01aa', '\x01a1', sha256(p_email::bytea), '\x01a2',
    '\x01bb', 1::smallint, p_conselho, sha256(('pin-' || p_numero)::bytea), 1::smallint, v_doc, v_payload,
    coalesce(p_codigo, private.atta_code_from_sha256(encode(sha256(v_payload), 'hex'))), 'staging-seal-teste-propass',
    sha512('selo-ficticio'::bytea),
    jsonb_build_object('storage_path', coalesce(v_tenant::text, gen_random_uuid()::text) || '/' || v_doc || '/assinatura.png',
                       'sha256_plain', repeat('a', 64), 'size_bytes', 2048, 'dek_wrapped', 'abcd', 'kek_version', 1),
    p_aviso);
end $$;
create function pg_temp.enviar_com(p_segredo text, p_email text, p_cpf text, p_numero text, p_prof uuid,
                                   p_versao smallint default 1) returns text
language plpgsql security definer as $$
declare
  v_link uuid; v_tenant uuid; v_doc uuid := gen_random_uuid(); v_payload bytea; tv record;
begin
  select g.professional_link_id, g.tenant_id into v_link, v_tenant from platform.access_grant g
  where g.secret_hash = sha256(p_segredo::bytea);
  select * into tv from documents.template_version t
  where t.tenant_id = v_tenant and t.kind = 'termo_de_autorizacao' order by t.version desc limit 1;
  v_payload := convert_to(jsonb_build_object(
    'atta_sign_version', '1',
    'document', jsonb_build_object('id', v_doc, 'type', 'termo_de_autorizacao', 'template_id', tv.template_id,
                                   'template_version', tv.version, 'body_sha256', tv.body_sha256,
                                   'body_normalization', tv.body_normalization),
    'tenant', (select jsonb_build_object('legal_name', c.legal_name, 'trade_name', c.name, 'cnpj', c.cnpj)
               from platform.tenant c where c.id = v_tenant),
    'parties', jsonb_build_array(jsonb_build_object('ref', 'p1', 'role', 'professional', 'name', 'Dra. Fictícia ' || p_numero,
                                                    'council', 'CRO-SP ' || p_numero)),
    'signature', jsonb_build_object('signer', 'p1', 'level', 'atta_sign',
                                    'signed_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                                    'stroke_sha256', repeat('a', 64)),
    'context', jsonb_build_object('product', 'atta_in', 'context_type', 'professional_authorization', 'context_id', v_link)
  )::text, 'UTF8');
  return api.propass_submit(sha256(p_segredo::bytea), p_prof, 'Dra. Fictícia ' || p_numero, 'cro', 'SP', p_numero,
    sha256(p_cpf::bytea), '···.···.000-00', '\x01aa', '\x01a1', sha256(p_email::bytea), '\x01a2', '\x01bb', 1::smallint,
    'nao_consultado', sha256(('pin-' || p_numero)::bytea), p_versao, v_doc, v_payload,
    private.atta_code_from_sha256(encode(sha256(v_payload), 'hex')), 'staging-seal-teste-propass', sha512('selo-ficticio'::bytea),
    jsonb_build_object('storage_path', v_tenant::text || '/' || v_doc || '/assinatura.png', 'sha256_plain', repeat('a', 64),
                       'size_bytes', 2048, 'dek_wrapped', 'abcd', 'kek_version', 1), null);
end $$;
create function pg_temp.identidade(p_segredo text, p_cpf text, p_numero text) returns jsonb language sql as $$
  select api.propass_identity_check(sha256(p_segredo::bytea), 'cro', 'SP', p_numero, sha256(p_cpf::bytea))
$$;
create function pg_temp.pin_de(p_prof uuid) returns boolean language sql security definer as $$
  select exists (select 1 from platform.professional_pin where professional_id = p_prof)
$$;
create function pg_temp.termo(p_link uuid) returns text language sql security definer as $$
  select string_agg(d.status, ',') from documents.document d where d.professional_link_id = p_link
$$;
create function pg_temp.pins() returns int language sql security definer as $$
  select count(*)::int from platform.professional_pin
$$;
create function pg_temp.sem_ciencia(p_link uuid) returns boolean language sql security definer as $$
  select privacy_notice_version is null and privacy_notice_ack_at is null and propass_completed_at is not null
  from platform.professional_tenant_link where id = p_link
$$;

create function pg_temp.vivos(p_link uuid) returns int language sql security definer as $$
  select count(*)::int from platform.access_grant
  where professional_link_id = p_link and purpose = 'professional_propass' and revoked_at is null
$$;
create function pg_temp.envelhecer(p_segredo text, p_idade interval) returns void language sql security definer as $$
  update platform.access_grant set created_at = now() - p_idade, expires_at = now() - p_idade + interval '7 days'
  where secret_hash = sha256(p_segredo::bytea)
$$;
-- conta só os do teste: o seed local (ids eeee, supabase/seed.sql) já traz uma profissional
create function pg_temp.profissionais() returns int language sql security definer as $$
  select count(*)::int from platform.professional where id::text not like 'eeee%'
$$;
create function pg_temp.nome_global(p_numero text) returns text language sql security definer as $$
  select display_name from platform.professional where council_number = p_numero
$$;
create function pg_temp.ciencia(p_link uuid) returns boolean language sql security definer as $$
  select privacy_notice_ack_at is not null and privacy_notice_version = 'v1' from platform.professional_tenant_link where id = p_link
$$;
create function pg_temp.falhas(p_segredo text) returns int language sql security definer as $$
  select propass_failures from platform.access_grant where secret_hash = sha256(p_segredo::bytea)
$$;
create function pg_temp.conselho(p_numero text) returns text language sql security definer as $$
  select council_status || '|' || (council_verified_at is not null)::text from platform.professional
  where council_number = p_numero
$$;
create function pg_temp.revogado_por_tentativas() returns int language sql security definer as $$
  select count(*)::int from audit.event where action = 'grant.revoke' and details ->> 'reason' = 'propass_attempts'
$$;
create function pg_temp.eventos(p_action text) returns int language sql security definer as $$
  select count(*)::int from audit.event where action = p_action
$$;

do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated, service_role',
                 pg_my_temp_schema()::regnamespace);
end $$;

select ok(not has_function_privilege('authenticated', 'api.propass_identity_check(bytea, text, text, text, bytea)', 'EXECUTE')
          and has_function_privilege('service_role', 'api.propass_identity_check(bytea, text, text, text, bytea)', 'EXECUTE'),
          'o passo 2 é só do servidor (service_role)');

-- A: profissional novo cria o PIN no envio
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select pg_temp.convidar('00000000-0000-4000-8000-0000000000c1', 'dra1@clinica-ficticia.test', 'link-a1');
select pg_temp.servidor();
select is(pg_temp.identidade('link-a1', 'cpf-1', '1001'), '{"status": "pedir_pin", "professional_id": null}'::jsonb,
          'profissional novo: pedir a senha, sem id');
select is(pg_temp.enviar_com('link-a1', 'dra1@clinica-ficticia.test', 'cpf-1', '1001', '00000000-0000-4000-8000-0000000000f1'), 'ok',
          'A conclui o PROpass e cria o PIN');

-- B convida o mesmo e-mail: o mesmo profissional, que já tem PIN, usa o dele
select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'ADMIN');
select pg_temp.convidar('00000000-0000-4000-8000-0000000000c2', 'dra1@clinica-ficticia.test', 'link-b1');
select pg_temp.servidor();
select is(pg_temp.identidade('link-b1', 'cpf-1', '1001'), '{"status": "usar_pin_existente"}'::jsonb,
          'conselho, CPF e e-mail do convite batem com quem já tem PIN: usar a senha que já existe');
select is(pg_temp.identidade('link-b1', 'cpf-2', '1001'), '{"status": "pedir_pin", "professional_id": null}'::jsonb,
          'CPF que não confere: a mesma resposta do profissional novo (sem oráculo de CPF)');
select is(pg_temp.identidade('link-b1', 'cpf-1', '2002'), '{"status": "pedir_pin", "professional_id": null}'::jsonb,
          'conselho novo com o CPF de outro: também a mesma resposta');
select is(pg_temp.falhas('link-b1'), 0, 'o passo 2 não conta tentativa nem grava nada (a recusa é do envio)');

-- C: um profissional que já existe SEM PIN (homologado antes do PIN; fictício, direto como dono)
select set_config('role', 'postgres', true);
insert into platform.professional (id, display_name, council, council_uf, council_number, cpf_hmac, cpf_masked, cpf_enc,
                                   email_hmac, email_enc, dek_wrapped, kek_version, council_status)
values ('00000000-0000-4000-8000-0000000000f3', 'Dr. Fictício 3003', 'cro', 'SP', '3003', sha256('cpf-3'::bytea),
        '···.···.000-03', '\x01', sha256('dr3@clinica-ficticia.test'::bytea), '\x01', '\x01', 1, 'nao_consultado');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000c', 'ADMIN');
select pg_temp.convidar('00000000-0000-4000-8000-0000000000c3', 'dr3@clinica-ficticia.test', 'link-c1');
select pg_temp.convidar('00000000-0000-4000-8000-0000000000c4', 'dr3.outro@clinica-ficticia.test', 'link-c2');
select pg_temp.servidor();
select is(pg_temp.identidade('link-c1', 'cpf-3', '3003'),
          '{"status": "pedir_pin", "professional_id": "00000000-0000-4000-8000-0000000000f3"}'::jsonb,
          'existente sem PIN, identidade inteira conferida: pedir a senha, com o id para o servidor calcular o pin_mac');
select is(pg_temp.identidade('link-c2', 'cpf-3', '3003'), '{"status": "pedir_pin", "professional_id": null}'::jsonb,
          'o mesmo conselho e CPF por outro e-mail de convite: sem id (o e-mail é o do convite, travado)');
select throws_ok($$ select pg_temp.enviar_com('link-c1', 'dr3@clinica-ficticia.test', 'cpf-3', '3003',
                                              '00000000-0000-4000-8000-0000000000f3', 2::smallint) $$,
                 'P0001', 'ATTA-IN-0001', 'pin_mac_version diferente de 1 é recusado');
select is(pg_temp.enviar_com('link-c1', 'dr3@clinica-ficticia.test', 'cpf-3', '3003', '00000000-0000-4000-8000-0000000000f3'), 'ok',
          'o reaproveitado sem PIN conclui');
select ok(pg_temp.pin_de('00000000-0000-4000-8000-0000000000f3'), 'e cria o PIN dele, com o id que o passo 2 deu');

-- D: reaproveitado sem PIN, mas o servidor mandou outro id: nenhum PIN é criado (o mac não seria dele)
select set_config('role', 'postgres', true);
insert into platform.professional (id, display_name, council, council_uf, council_number, cpf_hmac, cpf_masked, cpf_enc,
                                   email_hmac, email_enc, dek_wrapped, kek_version, council_status)
values ('00000000-0000-4000-8000-0000000000f4', 'Dr. Fictício 4004', 'cro', 'SP', '4004', sha256('cpf-4'::bytea),
        '···.···.000-04', '\x01', sha256('dr4@clinica-ficticia.test'::bytea), '\x01', '\x01', 1, 'nao_consultado');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000d', 'ADMIN');
select pg_temp.convidar('00000000-0000-4000-8000-0000000000c5', 'dr4@clinica-ficticia.test', 'link-d1');
select pg_temp.servidor();
select is(pg_temp.enviar_com('link-d1', 'dr4@clinica-ficticia.test', 'cpf-4', '4004', gen_random_uuid()), 'ok',
          'reaproveitado sem PIN com outro id: o envio conclui');
select ok(not pg_temp.pin_de('00000000-0000-4000-8000-0000000000f4'), 'mas nenhum PIN é criado com um mac que não é dele');

-- limite por link no passo 2 (Tech Lead): 10 por hora; a 11ª conferência é recusada com LIMITE
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select pg_temp.convidar('00000000-0000-4000-8000-0000000000c6', 'golpe@clinica-ficticia.test', 'link-a2');
select pg_temp.servidor();
do $$ begin
  for i in 1..10 loop perform pg_temp.identidade('link-a2', 'cpf-tentativa-' || i, '1001'); end loop;
end $$;
select throws_ok($$ select pg_temp.identidade('link-a2', 'cpf-1', '1001') $$, '54000', 'ATTA-IN-0003',
                 'a 11ª conferência no mesmo link é recusada (o link não vira oráculo de CPF)');
select is(pg_temp.identidade('link-b1', 'cpf-1', '1001'), '{"status": "usar_pin_existente"}'::jsonb,
          'o limite é por link: o outro convite segue respondendo');

-- A existente com PIN continua com o mesmo PIN (nunca sobrescreve)
select is(pg_temp.pins(), 2, 'dois PINs: o da A e o do reaproveitado sem PIN; o da B não foi sobrescrito');

select * from finish();
rollback;
