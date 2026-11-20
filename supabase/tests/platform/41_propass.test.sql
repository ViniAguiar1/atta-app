-- MIG-14b (1): PROpass pelo link do convite (PDD v206 §10.4.3; ADR 0004 §3). Dados fictícios: bytes e nomes inventados.
begin;
select plan(44);

insert into platform.tenant (id, name) values
  ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A'),
  ('00000000-0000-4000-8000-00000000000b', 'Clínica Fictícia B'),
  ('00000000-0000-4000-8000-00000000000c', 'Clínica Fictícia C'),
  ('00000000-0000-4000-8000-00000000000d', 'Clínica Fictícia D');

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
                               p_conselho text default 'regularizado', p_nome text default null) returns text
language sql as $$
  select api.propass_submit(sha256(p_segredo::bytea), gen_random_uuid(), coalesce(p_nome, 'Dra. Fictícia ' || p_numero),
                            'cro', 'SP', p_numero, sha256(p_cpf::bytea), '···.···.000-00', '\x01aa', '\x01a1',
                            sha256(p_email::bytea), '\x01a2', '\x01bb', 1::smallint, p_conselho, 'v1')
$$;


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
          'api.propass_submit(bytea, uuid, text, text, text, text, bytea, text, bytea, bytea, bytea, bytea, bytea, smallint, text, text)',
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
          'o profissional grava os próprios dados');
select is(pg_temp.profissionais(), 1, 'nasce o profissional');
select is(pg_temp.conselho('1001'), 'regularizado|true', 'com consulta de verdade: regularizado, com a hora da conferência');
select is((select step from api.propass_resolve(sha256('link-a1-b'::bytea))), 'termo',
          'o link segue para o Termo (a última etapa, parte 2)');
select throws_ok($$ select pg_temp.enviar('link-a1-b', 'dra1@clinica-ficticia.test', 'cpf-1', '1001') $$,
                 'P0001', 'ATTA-IN-0001', 'os dados não são gravados duas vezes');

select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select ok((select status = 'cadastro_concluido' and display_name = 'Dra. Fictícia 1001' and cpf_masked = '···.···.000-00'
           from api.professional_get('00000000-0000-4000-8000-0000000000c1')), 'a clínica vê o cadastro concluído');
select ok(pg_temp.ciencia('00000000-0000-4000-8000-0000000000c1'), 'a ciência do Aviso de Privacidade fica registrada, com a versão');

-- clínica B convida o MESMO e-mail: o mesmo profissional (conselho, CPF e e-mail) liga ao existente, sem mexer nos dados
select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'ADMIN');
select pg_temp.convidar('00000000-0000-4000-8000-0000000000c2', 'dra1@clinica-ficticia.test', 'link-b1');
select pg_temp.servidor();
select is(pg_temp.enviar('link-b1', 'dra1@clinica-ficticia.test', 'cpf-1', '1001', 'regularizado', 'Outro Nome Fictício'), 'ok',
          'mesmo conselho, mesmo CPF e mesmo e-mail: liga ao existente');
select is(pg_temp.profissionais(), 1, 'não nasce outro profissional');
select is(pg_temp.nome_global('1001'), 'Dra. Fictícia 1001', 'os dados globais não mudam por um convite de outra clínica');

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

-- clínica D: sem consulta real ao conselho (R20), o PROpass grava 'nao_consultado', sem hora de conferência
select pg_temp.entrar('00000000-0000-4000-8000-00000000000d', 'ADMIN');
select pg_temp.convidar('00000000-0000-4000-8000-0000000000c4', 'dr4@clinica-ficticia.test', 'link-d1');
select pg_temp.servidor();
select is(pg_temp.enviar('link-d1', 'dr4@clinica-ficticia.test', 'cpf-4', '4004', 'nao_consultado'), 'ok',
          'sem consulta ao conselho, grava como não consultado');
select is(pg_temp.conselho('4004'), 'nao_consultado|false', 'não consultado: sem afirmar a regularidade');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000d', 'ADMIN');
select api.professional_delete('00000000-0000-4000-8000-0000000000c4');
select pg_temp.servidor();
select throws_ok($$ select * from api.propass_resolve(sha256('link-d1'::bytea)) $$, '42501', 'ATTA-AUTH-0004',
                 'a clínica excluiu o profissional: o link do PROpass não abre');

-- auditoria
select set_config('role', 'postgres', true);
select is(pg_temp.eventos('propass.submit'), 3, 'cada PROpass gravado vai para audit');
select ok(pg_temp.eventos('grant.revoke') >= 1 and pg_temp.eventos('propass.open') >= 1,
          'o reenvio e a abertura vão para audit');

select * from finish();
rollback;
