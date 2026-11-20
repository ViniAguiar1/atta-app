-- MIG-14b (1): PROpass pelo link do convite (PDD v206 §10.4.3; ADR 0004 §3). Dados fictícios: bytes e nomes inventados.
begin;
select plan(36);

insert into platform.tenant (id, name) values
  ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A'),
  ('00000000-0000-4000-8000-00000000000b', 'Clínica Fictícia B'),
  ('00000000-0000-4000-8000-00000000000c', 'Clínica Fictícia C');

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

-- o que o servidor manda depois de validar, conferir o conselho e cifrar
create function pg_temp.enviar(p_segredo text, p_email text, p_cpf text, p_numero text,
                               p_conselho_ok boolean default true) returns void language sql as $$
  select api.propass_submit(sha256(p_segredo::bytea), gen_random_uuid(), 'Dra. Fictícia ' || p_numero, 'cro', 'SP',
                            p_numero, sha256(p_cpf::bytea), '···.···.000-00', '\x01aa', '\x01a1',
                            sha256(p_email::bytea), '\x01a2', '\x01bb', 1::smallint, p_conselho_ok, 'v1')
$$;

-- código, mensagem e detalhe do erro: o caso do conselho e o do CPF precisam sair iguais
create function pg_temp.erro(p_sql text) returns text language plpgsql as $$
declare
  v_state text; v_msg text; v_detail text;
begin
  execute p_sql;
  return 'sem erro';
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail;
  return v_state || '|' || v_msg || '|' || coalesce(v_detail, '');
end $$;

create function pg_temp.vivos(p_link uuid) returns int language sql security definer as $$
  select count(*)::int from platform.access_grant
  where professional_link_id = p_link and purpose = 'professional_propass' and revoked_at is null
$$;
create function pg_temp.envelhecer(p_segredo text, p_idade interval) returns void language sql security definer as $$
  update platform.access_grant set created_at = now() - p_idade, expires_at = now() - p_idade + interval '7 days'
  where secret_hash = sha256(p_segredo::bytea)
$$;
create function pg_temp.profissionais() returns int language sql security definer as $$
  select count(*)::int from platform.professional
$$;
create function pg_temp.nome_global(p_numero text) returns text language sql security definer as $$
  select display_name from platform.professional where council_number = p_numero
$$;
create function pg_temp.ciencia(p_link uuid) returns boolean language sql security definer as $$
  select privacy_notice_ack_at is not null and privacy_notice_version = 'v1' from platform.professional_tenant_link where id = p_link
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
          'api.propass_submit(bytea, uuid, text, text, text, text, bytea, text, bytea, bytea, bytea, bytea, bytea, smallint, boolean, text)',
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
           from api.propass_resolve(sha256('link-a1'::bytea))), 'traz a clínica e o e-mail do convite para mostrar travado');
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
select throws_ok($$ select pg_temp.enviar('link-a1-b', 'dra1@clinica-ficticia.test', 'cpf-1', '1001', false) $$,
                 'P0001', 'ATTA-IN-0001', 'sem a conferência do conselho, não grava');
select lives_ok($$ select pg_temp.enviar('link-a1-b', 'dra1@clinica-ficticia.test', 'cpf-1', '1001') $$,
                'o profissional grava os próprios dados');
select is(pg_temp.profissionais(), 1, 'nasce o profissional');
select is((select step from api.propass_resolve(sha256('link-a1-b'::bytea))), 'termo',
          'o link segue para o Termo (a última etapa, parte 2)');
select throws_ok($$ select pg_temp.enviar('link-a1-b', 'dra1@clinica-ficticia.test', 'cpf-1', '1001') $$,
                 'P0001', 'ATTA-IN-0001', 'os dados não são gravados duas vezes');

select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select ok((select status = 'cadastro_concluido' and display_name = 'Dra. Fictícia 1001' and cpf_masked = '···.···.000-00'
           from api.professional_get('00000000-0000-4000-8000-0000000000c1')), 'a clínica vê o cadastro concluído');
select ok(pg_temp.ciencia('00000000-0000-4000-8000-0000000000c1'), 'a ciência do Aviso de Privacidade fica registrada, com a versão');

-- clínica B: o mesmo profissional (mesmo conselho e mesmo CPF) liga ao existente, sem mexer nos dados globais
select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'ADMIN');
select pg_temp.convidar('00000000-0000-4000-8000-0000000000c2', 'dra1.b@clinica-ficticia.test', 'link-b1');
select pg_temp.servidor();
select lives_ok($$ select api.propass_submit(sha256('link-b1'::bytea), gen_random_uuid(), 'Outro Nome Fictício', 'cro', 'SP',
                   '1001', sha256('cpf-1'::bytea), '···.···.000-00', '\x01ff', '\x01ff', sha256('dra1.b@clinica-ficticia.test'::bytea),
                   '\x01ff', '\x01ff', 1::smallint, true, 'v1') $$, 'mesmo conselho e mesmo CPF: liga ao existente');
select is(pg_temp.profissionais(), 1, 'não nasce outro profissional');
select is(pg_temp.nome_global('1001'), 'Dra. Fictícia 1001', 'os dados globais não mudam por um convite de outra clínica');

-- clínica C: conselho existente com outro CPF, e CPF existente com outro conselho: o mesmo erro, nada gravado
select pg_temp.entrar('00000000-0000-4000-8000-00000000000c', 'ADMIN');
select pg_temp.convidar('00000000-0000-4000-8000-0000000000c3', 'golpe@clinica-ficticia.test', 'link-c1');
select pg_temp.servidor();
select is(pg_temp.erro($$ select pg_temp.enviar('link-c1', 'golpe@clinica-ficticia.test', 'cpf-2', '1001') $$),
          'P0001|ATTA-IN-0001|propass', 'conselho de outro com CPF diferente: recusado (Tech Lead)');
select is(pg_temp.erro($$ select pg_temp.enviar('link-c1', 'golpe@clinica-ficticia.test', 'cpf-1', '2002') $$),
          'P0001|ATTA-IN-0001|propass', 'CPF de outro com conselho novo: o mesmo erro, sem dizer qual');
select is(pg_temp.profissionais(), 1, 'nada foi gravado');
select is((select step from api.propass_resolve(sha256('link-c1'::bytea))), 'dados', 'o vínculo da C segue sem profissional');

-- Boarding Check de um profissional da C (vínculo c3 já ligado não é preciso: o grant aponta para o vínculo)
select set_config('role', 'postgres', true);
select api.grant_issue('professional_boarding', sha256('boarding-c1'::bytea), '00000000-0000-4000-8000-00000000000c',
                       gen_random_uuid(), p_professional_link_id => '00000000-0000-4000-8000-0000000000c3');
select api.grant_mark_sent((select id from platform.access_grant where secret_hash = sha256('boarding-c1'::bytea)));
select pg_temp.servidor();
select lives_ok($$ select * from api.grant_resolve(sha256('boarding-c1'::bytea), 'professional_boarding') $$,
                'o link do Boarding Check vale com o vínculo vivo');

-- vínculo excluído: o link morre
select pg_temp.entrar('00000000-0000-4000-8000-00000000000c', 'ADMIN');
select api.professional_delete('00000000-0000-4000-8000-0000000000c3');
select pg_temp.servidor();
select throws_ok($$ select * from api.propass_resolve(sha256('link-c1'::bytea)) $$, '42501', 'ATTA-AUTH-0004',
                 'a clínica excluiu o profissional: o link não abre');
select throws_ok($$ select * from api.grant_resolve(sha256('boarding-c1'::bytea), 'professional_boarding') $$,
                 '42501', 'ATTA-AUTH-0004', 'a clínica excluiu o profissional: o link do Boarding Check também morre');

-- auditoria
select set_config('role', 'postgres', true);
select is(pg_temp.eventos('propass.submit'), 2, 'cada PROpass gravado vai para audit');
select ok(pg_temp.eventos('grant.revoke') >= 1 and pg_temp.eventos('propass.open') >= 1,
          'o reenvio e a abertura vão para audit');

select * from finish();
rollback;
