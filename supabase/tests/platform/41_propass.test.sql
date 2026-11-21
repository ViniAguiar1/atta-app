-- MIG-14b (1): PROpass pelo link do convite (PDD v206 §10.4.3; ADR 0004 §3). Dados fictícios: bytes e nomes inventados.
begin;
select plan(54);

insert into platform.tenant (id, name, legal_name, cnpj) values
  ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A', 'Clínica Fictícia A Ltda', '00000000410179'),
  ('00000000-0000-4000-8000-00000000000b', 'Clínica Fictícia B', 'Clínica Fictícia B Ltda', '00000000410250'),
  ('00000000-0000-4000-8000-00000000000c', 'Clínica Fictícia C', 'Clínica Fictícia C Ltda', '00000000410330'),
  ('00000000-0000-4000-8000-00000000000d', 'Clínica Fictícia D', 'Clínica Fictícia D Ltda', '00000000410411');
update platform.tenant set timezone = 'America/Manaus' where id = '00000000-0000-4000-8000-00000000000a';

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
                               p_aviso text default 'v1', p_codigo text default null,
                               p_com_pin boolean default true) returns text
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
    '\x01bb', 1::smallint, p_conselho, case when p_com_pin then sha256(('pin-' || p_numero)::bytea) end,
    case when p_com_pin then 1::smallint end, v_doc, v_payload,
    coalesce(p_codigo, private.atta_code_from_sha256(encode(sha256(v_payload), 'hex'))), 'staging-seal-teste-propass',
    sha512('selo-ficticio'::bytea),
    jsonb_build_object('storage_path', coalesce(v_tenant::text, gen_random_uuid()::text) || '/' || v_doc || '/assinatura.png',
                       'sha256_plain', repeat('a', 64), 'size_bytes', 2048, 'dek_wrapped', 'abcd', 'kek_version', 1),
    p_aviso);
end $$;
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

-- regra num lugar só e fluxo só pelo servidor (ADR 0004 §1 e §3)
select is((select ceiling from private.grant_policy('professional_propass')), interval '7 days',
          'o link do PROpass vale 7 dias (PDD §10.4.3)');
select is((select idle from private.grant_policy('professional_propass')), null::interval, 'sem inatividade');
select ok(not has_function_privilege('authenticated', 'api.propass_resolve(bytea)', 'EXECUTE'),
          'o navegador não abre o PROpass direto');
select ok(not has_function_privilege('authenticated',
          'api.propass_submit(bytea, uuid, text, text, text, text, bytea, text, bytea, bytea, bytea, bytea, bytea, smallint, text, bytea, smallint, uuid, bytea, text, text, bytea, jsonb, text)',
          'EXECUTE'), 'o navegador não grava o PROpass direto');
select ok(not has_function_privilege('authenticated', 'private.propass_issue(uuid, uuid, bytea)', 'EXECUTE')
          and not has_function_privilege('service_role', 'private.propass_issue(uuid, uuid, bytea)', 'EXECUTE'),
          'emitir o link só por dentro do convite e do reenvio');

-- convite emite o link; reenvio troca
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select pg_temp.convidar('00000000-0000-4000-8000-0000000000c1', 'dra1@clinica-ficticia.test', 'link-a1');
select is(pg_temp.vivos('00000000-0000-4000-8000-0000000000c1'), 1, 'o convite já sai com o link do PROpass');
select throws_ok($$ select api.professional_invite(gen_random_uuid(), sha256('x@x.test'::bytea), '\x01', gen_random_uuid(),
                   '\x01cc', 1::smallint, null) $$, 'P0001', 'ATTA-IN-0001', 'convite sem link é recusado');
select pg_temp.servidor();
select is((select step from api.propass_resolve(sha256('link-a1'::bytea))), 'dados', 'o link abre na etapa dos dados');
select ok((select tenant_name = 'Clínica Fictícia A' and invite_email_enc is not null and invite_envelope_id is not null
                  and invited_at is not null and expires_at = invited_at + interval '7 days'
           from api.propass_resolve(sha256('link-a1'::bytea))),
          'traz a clínica, o e-mail do convite para mostrar travado e a data do convite (7 dias até vencer)');
select is((select tenant_timezone from api.propass_resolve(sha256('link-a1'::bytea))), 'America/Manaus',
          'traz o fuso da clínica, para a data do convite na tela');
select is(pg_temp.vivos('00000000-0000-4000-8000-0000000000c1'), 1, 'abrir não consome o link');

select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select lives_ok($$ select api.professional_resend_invite('00000000-0000-4000-8000-0000000000c1', sha256('link-a1-b'::bytea)) $$,
                'Reenviar Link');
select is(pg_temp.vivos('00000000-0000-4000-8000-0000000000c1'), 1, 'um link vivo só');
select pg_temp.servidor();
select throws_ok($$ select * from api.propass_resolve(sha256('link-a1'::bytea)) $$, '42501', 'ATTA-AUTH-0004',
                 'o link anterior deixa de valer');
select lives_ok($$ select * from api.propass_resolve(sha256('link-a1-b'::bytea)) $$, 'o link novo vale');

-- 7 dias da emissão
select pg_temp.envelhecer('link-a1-b', interval '6 days 23 hours');
select lives_ok($$ select * from api.propass_resolve(sha256('link-a1-b'::bytea)) $$, 'com 6 dias e 23 h ainda vale');
select pg_temp.envelhecer('link-a1-b', interval '7 days 1 minute');
select throws_ok($$ select * from api.propass_resolve(sha256('link-a1-b'::bytea)) $$, '42501', 'ATTA-AUTH-0004',
                 'com 7 dias vence');
select pg_temp.envelhecer('link-a1-b', interval '1 hour');

-- envio: e-mail travado, conselho conferido
select throws_ok($$ select pg_temp.enviar('link-a1-b', 'outro@clinica-ficticia.test', 'cpf-1', '1001') $$,
                 'P0001', 'ATTA-IN-0001', 'e-mail diferente do convite é recusado');
select throws_ok($$ select pg_temp.enviar('link-a1-b', 'dra1@clinica-ficticia.test', 'cpf-1', '1001', 'nao_confere') $$,
                 'P0001', 'ATTA-IN-0001', 'conselho que não confere nunca grava');
select is(pg_temp.enviar('link-a1-b', 'dra1@clinica-ficticia.test', 'cpf-1', '1001'), 'ok',
          'o profissional grava os próprios dados, o Termo e o PIN num envio só');
select is(pg_temp.termo('00000000-0000-4000-8000-0000000000c1'), 'assinado_definitivo',
          'o Termo de Autorização nasce assinado no mesmo envio (ATTA Sign)');
select is(pg_temp.pins(), 1, 'o PIN do Boarding Check fica guardado (só o pin_mac)');
select is(pg_temp.profissionais(), 1, 'nasce o profissional');
select is(pg_temp.conselho('1001'), 'regularizado|true', 'com consulta de verdade: regularizado, com a hora da conferência');
select throws_ok($$ select * from api.propass_resolve(sha256('link-a1-b'::bytea)) $$, '42501', 'ATTA-AUTH-0004',
                 'concluído, o link do PROpass é consumido');
select throws_ok($$ select pg_temp.enviar('link-a1-b', 'dra1@clinica-ficticia.test', 'cpf-1', '1001') $$,
                 '42501', 'ATTA-AUTH-0004', 'nada é gravado duas vezes: o link já foi usado');

select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select ok((select status = 'cadastro_concluido' and display_name = 'Dra. Fictícia 1001' and cpf_masked = '···.···.000-00'
           from api.professional_get('00000000-0000-4000-8000-0000000000c1')), 'a clínica vê o cadastro concluído');
select ok(pg_temp.ciencia('00000000-0000-4000-8000-0000000000c1'), 'a ciência do Aviso de Privacidade fica registrada, com a versão');

-- clínica B convida o MESMO e-mail: o mesmo profissional (conselho, CPF e e-mail) liga ao existente, sem mexer nos dados
select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'ADMIN');
select pg_temp.convidar('00000000-0000-4000-8000-0000000000c2', 'dra1@clinica-ficticia.test', 'link-b1');
select pg_temp.servidor();
select is(pg_temp.enviar('link-b1', 'dra1@clinica-ficticia.test', 'cpf-1', '1001', 'regularizado', 'Outro Nome Fictício',
                         'v1', null, false), 'ok',
          'mesmo conselho, mesmo CPF e mesmo e-mail: liga ao existente');
select is(pg_temp.profissionais(), 1, 'não nasce outro profissional');
select is(pg_temp.nome_global('1001'), 'Dra. Fictícia 1001', 'os dados globais não mudam por um convite de outra clínica');
select is(pg_temp.termo('00000000-0000-4000-8000-0000000000c2'), 'assinado_definitivo', 'a clínica B tem o Termo dela');
select is(pg_temp.pins(), 1, 'o reaproveitado mantém o PIN que já tem');

-- clínica C (outro e-mail): toda divergência dá a mesma resposta, nada é gravado, e a 5ª recusa revoga o link
select pg_temp.entrar('00000000-0000-4000-8000-00000000000c', 'ADMIN');
select pg_temp.convidar('00000000-0000-4000-8000-0000000000c3', 'golpe@clinica-ficticia.test', 'link-c1');
select pg_temp.servidor();
select is(pg_temp.enviar('link-c1', 'golpe@clinica-ficticia.test', 'cpf-1', '1001'), 'recusado',
          'mesmo conselho e mesmo CPF, mas outro e-mail: recusado (Segurança, S2)');
select is(pg_temp.enviar('link-c1', 'golpe@clinica-ficticia.test', 'cpf-2', '1001'), 'recusado',
          'conselho de outro com CPF diferente: a mesma resposta (Tech Lead)');
select is(pg_temp.enviar('link-c1', 'golpe@clinica-ficticia.test', 'cpf-1', '2002'), 'recusado',
          'CPF de outro com conselho novo: a mesma resposta, sem dizer qual');
select is(pg_temp.profissionais(), 1, 'nada foi gravado');
select is(pg_temp.falhas('link-c1'), 3, 'cada recusa conta no link');
select is((select step from api.propass_resolve(sha256('link-c1'::bytea))), 'dados', 'o vínculo da C segue sem profissional');
select pg_temp.enviar('link-c1', 'golpe@clinica-ficticia.test', 'cpf-9', '1001');
select is(pg_temp.enviar('link-c1', 'golpe@clinica-ficticia.test', 'cpf-8', '1001'), 'recusado', 'a 5ª recusa');
select throws_ok($$ select * from api.propass_resolve(sha256('link-c1'::bytea)) $$, '42501', 'ATTA-AUTH-0004',
                 'na 5ª recusa o link é revogado: o link deixa de ser oráculo de CPF (Tech Lead)');
select set_config('role', 'postgres', true);
select ok(pg_temp.eventos('propass.refused') = 5 and pg_temp.revogado_por_tentativas() = 1,
          'cada recusa e a revogação por tentativas vão para audit');

-- Boarding Check de um profissional da C (o grant aponta para o vínculo)
select api.grant_issue('professional_boarding', sha256('boarding-c1'::bytea), '00000000-0000-4000-8000-00000000000c',
                       gen_random_uuid(), p_professional_link_id => '00000000-0000-4000-8000-0000000000c3');
select api.grant_mark_sent((select id from platform.access_grant where secret_hash = sha256('boarding-c1'::bytea)));
select pg_temp.servidor();
select lives_ok($$ select * from api.grant_resolve(sha256('boarding-c1'::bytea), 'professional_boarding') $$,
                'o link do Boarding Check vale com o vínculo vivo');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000c', 'ADMIN');
select api.professional_delete('00000000-0000-4000-8000-0000000000c3');
select pg_temp.servidor();
select throws_ok($$ select * from api.grant_resolve(sha256('boarding-c1'::bytea), 'professional_boarding') $$,
                 '42501', 'ATTA-AUTH-0004', 'a clínica excluiu o profissional: o link do Boarding Check morre');

-- clínica D: pacote do Termo com defeito volta o envio inteiro; sem a consulta automática (R20) grava 'nao_consultado';
-- com o Aviso desligado (P2b) conclui sem a ciência
select pg_temp.entrar('00000000-0000-4000-8000-00000000000d', 'ADMIN');
select pg_temp.convidar('00000000-0000-4000-8000-0000000000c4', 'dr4@clinica-ficticia.test', 'link-d1');
select pg_temp.convidar('00000000-0000-4000-8000-0000000000c5', 'dr5@clinica-ficticia.test', 'link-d2');
select pg_temp.servidor();
select throws_ok($$ select pg_temp.enviar('link-d1', 'dr4@clinica-ficticia.test', 'cpf-4', '4004', 'nao_consultado',
                                          null, null, 'ATTA-0000-0000-0000') $$,
                 'P0001', 'ATTA-IN-0001', 'pacote do Termo com defeito (Código ATTA): o envio inteiro é recusado');
select ok(pg_temp.profissionais() = 1 and pg_temp.pins() = 1 and pg_temp.termo('00000000-0000-4000-8000-0000000000c4') is null,
          'nada ficou pela metade: nem profissional, nem PIN, nem Termo');
select is((select step from api.propass_resolve(sha256('link-d1'::bytea))), 'dados', 'e o link continua valendo');
select is(pg_temp.enviar('link-d1', 'dr4@clinica-ficticia.test', 'cpf-4', '4004', 'nao_consultado', null, null), 'ok',
          'sem consulta ao conselho e com o Aviso desligado, o PROpass conclui');
select is(pg_temp.conselho('4004'), 'nao_consultado|false', 'não consultado: sem afirmar a regularidade');
select ok(pg_temp.sem_ciencia('00000000-0000-4000-8000-0000000000c4'), 'Aviso desligado: concluído sem a ciência (P2b)');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000d', 'ADMIN');
select api.professional_delete('00000000-0000-4000-8000-0000000000c5');
select pg_temp.servidor();
select throws_ok($$ select * from api.propass_resolve(sha256('link-d2'::bytea)) $$, '42501', 'ATTA-AUTH-0004',
                 'a clínica excluiu o profissional: o link do PROpass não abre');

-- auditoria
select set_config('role', 'postgres', true);
select is(pg_temp.eventos('propass.submit'), 3, 'cada PROpass gravado vai para audit');
select ok(pg_temp.eventos('grant.revoke') >= 1 and pg_temp.eventos('propass.open') >= 1,
          'o reenvio e a abertura vão para audit');
select is(pg_temp.eventos('professional.pin_set'), 2, 'cada PIN criado vai para audit (sem o pin_mac)');

select * from finish();
rollback;
