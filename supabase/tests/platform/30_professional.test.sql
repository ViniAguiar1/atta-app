-- MIG-14a (1): profissional sem login. A clínica só convida pelo e-mail (cifrado no vínculo); os dados do profissional
-- vêm do PROpass (MIG-14b), simulado aqui (PDD v206 §10.4.3; ADR 0001 §1). Dados fictícios: bytes e nomes inventados.
begin;
select plan(30);

insert into platform.tenant (id, name) values
  ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A'),
  ('00000000-0000-4000-8000-00000000000b', 'Clínica Fictícia B');

create function pg_temp.entrar(p_tenant uuid, p_role text) returns void language plpgsql as $$
declare
  v_user uuid := gen_random_uuid();
begin
  -- usuário fictício com vínculo ativo na clínica: o has_permission do MIG-02 confere o vínculo no banco
  perform set_config('role', 'postgres', true);
  insert into auth.users (id, email) values (v_user, v_user::text || '@teste.invalid');
  if p_tenant is not null and p_role in ('ADMIN', 'COLABORADOR') then
    insert into platform.membership (tenant_id, user_id, app_role) values (p_tenant, v_user, p_role);
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'tenant_id', p_tenant, 'app_role', p_role,
                      -- ADMIN só com o 2º fator no token (MIG-03)
                      'aal', case when p_role = 'ADMIN' then 'aal2' else 'aal1' end)::text, true);
end $$;

create function pg_temp.remover_vinculo() returns void language plpgsql as $$
begin
  -- o vínculo sai do banco, mas o token continua válido (regra da ADR 0001 §2, revisão do MIG-02)
  perform set_config('role', 'postgres', true);
  update platform.membership set deleted_at = now()
  where user_id = (current_setting('request.jwt.claims')::jsonb ->> 'sub')::uuid;
  perform set_config('role', 'authenticated', true);
end $$;

create function pg_temp.convidar(p_id uuid, p_email text) returns uuid language sql as $$
  select api.professional_invite(p_id, sha256(p_email::bytea), ('\x01' || encode(p_email::bytea, 'hex'))::bytea,
                                 gen_random_uuid(), '\x01cc', 1::smallint)
$$;
-- simula o PROpass (MIG-14b): o profissional preenche os dados dele e o vínculo é ligado
create function pg_temp.propass(p_link uuid, p_prof uuid) returns void language plpgsql security definer as $$
begin
  insert into platform.professional (id, display_name, council, council_uf, council_number, cpf_hmac, cpf_masked, cpf_enc,
                                     phone_enc, email_enc, dek_wrapped, kek_version)
  values (p_prof, 'Dra. Fictícia Silva', 'cro', 'SP', '12345', sha256('cpf-prof-1'::bytea), '***.***.***-00', '\x01aa',
          '\x01a1', '\x01a2', '\x01bb', 1)
  on conflict (id) do nothing;
  update platform.professional_tenant_link set professional_id = p_prof, propass_completed_at = now() where id = p_link;
end $$;

do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated',
                 pg_my_temp_schema()::regnamespace);
end $$;

-- colunas sensíveis cifradas e fora do grant (ADR 0001, schema exposto)
select ok(has_column_privilege('authenticated', 'platform.professional', 'display_name', 'SELECT'), 'nome é legível');
select ok(not has_column_privilege('authenticated', 'platform.professional', 'cpf_masked', 'SELECT'), 'CPF fora do grant');
select ok(not has_column_privilege('authenticated', 'platform.professional', 'phone_enc', 'SELECT'), 'WhatsApp fora do grant');
select ok(not has_column_privilege('authenticated', 'platform.professional_tenant_link', 'invite_email_enc', 'SELECT'),
          'e-mail do convite fora do grant');
select ok(not has_table_privilege('authenticated', 'platform.professional', 'INSERT'), 'a clínica não grava o profissional');
select ok(not has_table_privilege('authenticated', 'platform.professional_tenant_link', 'INSERT'), 'vínculo só por api');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'platform.professional_tenant_link'::regclass),
          'vínculo com RLS forçada');
select is((select count(*)::int from information_schema.parameters
           where specific_schema = 'api' and specific_name like 'professional_invite%'
             and parameter_name ~ '(cpf|phone|whatsapp|council|name)'), 0,
          'o convite não recebe CPF, WhatsApp, conselho nem nome: quem preenche é o profissional (PDD §10.4.3)');

-- convite (só ADMIN edita a equipe); o e-mail é obrigatório
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'COLABORADOR');
select throws_ok($$ select pg_temp.convidar(gen_random_uuid(), 'dra@clinica-ficticia.test') $$, '42501', 'ATTA-AUTH-0004',
                 'Colaborador não convida profissional');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select throws_ok($$ select api.professional_invite(gen_random_uuid(), null, null, null, null, null) $$,
                 'P0001', 'ATTA-IN-0001', 'convite sem e-mail é recusado');
select is(pg_temp.convidar('00000000-0000-4000-8000-0000000000c1', 'dra@clinica-ficticia.test'), '00000000-0000-4000-8000-0000000000c1'::uuid, 'A convida pelo e-mail');
select throws_ok($$ select pg_temp.convidar(gen_random_uuid(), 'dra@clinica-ficticia.test') $$, '23505', 'ATTA-IN-0002',
                 'o mesmo e-mail não é convidado duas vezes na clínica');
select ok((select status = 'convite_enviado' and invite_email_enc is not null and display_name is null
                  and cpf_masked is null and phone_enc is null from api.professional_get('00000000-0000-4000-8000-0000000000c1')),
          'antes do PROpass: só o e-mail do convite, nada do profissional');
select lives_ok($$ select api.professional_resend_invite('00000000-0000-4000-8000-0000000000c1', sha256('dra.nova@clinica-ficticia.test'::bytea),
                   '\x01ff') $$, 'antes do PROpass a clínica corrige o e-mail e reenvia');
select is((select invite_email_enc from api.professional_get('00000000-0000-4000-8000-0000000000c1')), '\x01ff'::bytea, 'o e-mail novo vale');

-- clínica B: não vê o convite da A; convida o mesmo e-mail na clínica dela
select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'ADMIN');
select is((select count(*)::int from platform.professional_tenant_link), 0, 'B não vê os vínculos da A');
select throws_ok($$ select * from api.professional_get('00000000-0000-4000-8000-0000000000c1') $$, 'P0002', 'ATTA-CORE-0005', 'B não lê o convite da A');
select is(pg_temp.convidar('00000000-0000-4000-8000-0000000000c2', 'dra.nova@clinica-ficticia.test'), '00000000-0000-4000-8000-0000000000c2'::uuid, 'B convida o mesmo e-mail');

-- PROpass feito (simulado): a clínica vê o que a lista da §10.4.3 mostra, CPF só mascarado
select pg_temp.propass('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000f1');
select pg_temp.propass('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000f1');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select ok((select status = 'cadastro_concluido' and display_name = 'Dra. Fictícia Silva' and council_number = '12345'
                  and cpf_masked = '***.***.***-00' and phone_enc = '\x01a1' and invite_email_enc is null
           from api.professional_get('00000000-0000-4000-8000-0000000000c1')), 'depois do PROpass: nome, conselho, WhatsApp e CPF só mascarado');
select ok((select phone_enc = '\x01a1' and email_enc = '\x01a2' from api.professional_list() where link_id = '00000000-0000-4000-8000-0000000000c1'),
          'a lista traz o WhatsApp e o e-mail (clicar copia)');
select throws_ok($$ select api.professional_resend_invite('00000000-0000-4000-8000-0000000000c1', sha256('outro@x.test'::bytea), '\x01ee') $$,
                 'P0001', 'ATTA-IN-0001', 'depois do PROpass o e-mail é o do profissional, travado');
select lives_ok($$ select api.professional_resend_invite('00000000-0000-4000-8000-0000000000c1') $$, 'Reenviar Link sem troca de e-mail');
select throws_ok($$ select cpf_masked from platform.professional $$, '42501', null, 'select direto do CPF é negado');
select is((select count(*)::int from platform.professional), 1, 'a A vê o profissional ligado a ela');

-- Excluir (PDD §10.4.3): o vínculo sai da clínica; a B segue com o dela
select lives_ok($$ select api.professional_delete('00000000-0000-4000-8000-0000000000c1') $$, 'A exclui o profissional da clínica');
select is((select count(*)::int from api.professional_list()), 0, 'a lista da A fica vazia');
select is(pg_temp.convidar('00000000-0000-4000-8000-0000000000c3', 'dra.nova@clinica-ficticia.test'), '00000000-0000-4000-8000-0000000000c3'::uuid,
          'depois de excluir, o mesmo e-mail pode ser convidado de novo');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'ADMIN');
select is((select count(*)::int from api.professional_list()), 1, 'a B segue com o profissional dela');

-- vínculo de usuário removido com o token ainda válido: nada (ADR 0001 §2)
select pg_temp.remover_vinculo();
select throws_ok($$ select * from api.professional_list() $$, '42501', 'ATTA-AUTH-0004',
                 'vínculo removido: o ADMIN não lista os profissionais');
select is((select count(*)::int from platform.professional_tenant_link), 0, 'vínculo removido: nada, nem direto');

select * from finish();
rollback;
