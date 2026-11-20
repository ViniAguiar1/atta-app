-- MIG-14a (1): profissional em platform (identidade pública global, CPF cifrado), contato por clínica no vínculo,
-- reaproveitamento só pelo conselho (ADR 0001 §1; PDD v206 §10.4.3). Dados fictícios: bytes e nomes inventados.
begin;
select plan(32);

insert into platform.tenant (id, name) values
  ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A'),
  ('00000000-0000-4000-8000-00000000000b', 'Clínica Fictícia B'),
  ('00000000-0000-4000-8000-00000000000c', 'Clínica Fictícia C');

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

-- cadastro com CPF (envelope da pessoa) e, se vier, o contato desta clínica (envelope do vínculo)
create function pg_temp.cadastrar(p_id uuid, p_nome text, p_numero text, p_cpf text default null,
                                  p_env uuid default null, p_fone bytea default null) returns boolean language sql as $$
  select reused from api.professional_register(p_id, p_nome, 'CRO', 'sp', p_numero,
    sha256(coalesce(p_cpf, p_numero)::bytea), '***.***.***-00', '\x01aa', '\x01bb', 1::smallint,
    p_envelope_id => p_env, p_phone_enc => p_fone,
    p_link_dek_wrapped => case when p_env is not null then '\x01cc'::bytea end,
    p_link_kek_version => case when p_env is not null then 1::smallint end)
$$;

do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated',
                 pg_my_temp_schema()::regnamespace);
end $$;

-- colunas sensíveis cifradas e fora do grant (ADR 0001, schema exposto)
select ok(has_column_privilege('authenticated', 'platform.professional', 'display_name', 'SELECT'), 'nome de exibição é legível');
select ok(has_column_privilege('authenticated', 'platform.professional', 'council_number', 'SELECT'), 'registro no conselho é legível');
select ok(not has_column_privilege('authenticated', 'platform.professional', 'cpf_enc', 'SELECT'), 'cpf_enc fora do grant');
select ok(not has_column_privilege('authenticated', 'platform.professional', 'cpf_hmac', 'SELECT'), 'cpf_hmac fora do grant');
select ok(not has_column_privilege('authenticated', 'platform.professional', 'cpf_masked', 'SELECT'), 'cpf_masked fora do grant');
select ok(not has_column_privilege('authenticated', 'platform.professional_tenant_link', 'phone_enc', 'SELECT'),
          'contato do vínculo fora do grant');
select ok(not has_column_privilege('authenticated', 'platform.professional_tenant_link', 'dek_wrapped', 'SELECT'),
          'envelope do vínculo fora do grant');
select ok(not has_table_privilege('authenticated', 'platform.professional_tenant_link', 'INSERT'),
          'vínculo só se grava por api');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'platform.professional'::regclass),
          'professional com RLS forçada');

-- cadastro na A (só ADMIN edita a equipe)
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'COLABORADOR');
select throws_ok($$ select pg_temp.cadastrar(gen_random_uuid(), 'Dra. Fictícia', '12345') $$, '42501', 'ATTA-AUTH-0004',
                 'Colaborador não cadastra profissional');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select throws_ok($$ select * from api.professional_register(gen_random_uuid(), 'Dra. Fictícia', 'cro', 'SP', '12345',
                    p_phone_enc => '\x01a1') $$, 'P0001', 'ATTA-IN-0001', 'contato sem o envelope do vínculo é recusado');
select is(pg_temp.cadastrar('00000000-0000-4000-8000-0000000000f1', 'Dra. Fictícia', '12345', 'cpf-prof-1', '00000000-0000-4000-8000-0000000000ea', '\x01a1'), false, 'profissional novo');
select throws_ok($$ select pg_temp.cadastrar(gen_random_uuid(), 'Outra', '12345') $$, '23505', 'ATTA-IN-0002',
                 'o mesmo registro não se cadastra duas vezes na clínica');
select throws_ok($$ select * from api.professional_register(gen_random_uuid(), 'Dr. X', 'crmx', 'SP', '1') $$, '23514',
                 null, 'conselho fora da lista do PDD é recusado');
select is((select count(*)::int from platform.professional), 1, 'a A vê o profissional dela');
select ok((select cpf_masked = '***.***.***-00' and phone_enc = '\x01a1' and envelope_id = '00000000-0000-4000-8000-0000000000ea'
           from api.professional_get('00000000-0000-4000-8000-0000000000f1')), 'a A, que criou, lê o CPF mascarado e o contato dela, só por api');
select throws_ok($$ select cpf_enc from platform.professional $$, '42501', null, 'select direto de cpf_enc é negado');
select throws_ok($$ select phone_enc from platform.professional_tenant_link $$, '42501', null,
                 'select direto do contato do vínculo é negado');

-- clínica B: não vê o da A; o CPF não reaproveita nem revela; o conselho reaproveita sem mostrar o dado da A
select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'ADMIN');
select is((select count(*)::int from platform.professional), 0, 'B não vê o profissional da A');
select throws_ok($$ select * from api.professional_get('00000000-0000-4000-8000-0000000000f1') $$, 'P0002', 'ATTA-CORE-0005',
                 'B não lê o profissional da A');
select throws_ok($$ select pg_temp.cadastrar(gen_random_uuid(), 'Outro Registro', '99999', 'cpf-prof-1') $$,
                 'P0001', 'ATTA-IN-0001', 'CPF de outro profissional: erro genérico, sem reaproveitar nem dizer quem é');
select is(pg_temp.cadastrar(gen_random_uuid(), 'Nome Digitado Pela B', '12345', null, '00000000-0000-4000-8000-0000000000eb', '\x01b1'), true,
          'o mesmo registro no conselho é reaproveitado');
select is((select cpf_masked from api.professional_get('00000000-0000-4000-8000-0000000000f1')), null, 'B, que reaproveitou, não vê o CPF mascarado');
select ok((select phone_enc = '\x01b1' and envelope_id = '00000000-0000-4000-8000-0000000000eb' from api.professional_get('00000000-0000-4000-8000-0000000000f1')),
          'B vê só o contato dela, nunca o da A');
select lives_ok($$ select api.professional_set_contact('00000000-0000-4000-8000-0000000000f1', p_phone_enc => '\x01b2') $$,
                'B troca o contato dela com o mesmo envelope');
select throws_ok($$ select api.professional_set_contact('00000000-0000-4000-8000-0000000000f1', p_phone_enc => '\x01b3', p_envelope_id => gen_random_uuid(),
                    p_dek_wrapped => '\x01dd', p_kek_version => 2::smallint) $$,
                 'P0001', 'ATTA-IN-0001', 'o envelope do vínculo não é trocado depois de criado');
select lives_ok($$ select api.professional_set_active('00000000-0000-4000-8000-0000000000f1', false) $$, 'B desativa o vínculo dela');

-- C reaproveita sem contato e cria o envelope no primeiro contato
select pg_temp.entrar('00000000-0000-4000-8000-00000000000c', 'ADMIN');
select is(pg_temp.cadastrar(gen_random_uuid(), 'Nome Digitado Pela C', '12345'), true, 'C reaproveita sem contato');
select throws_ok($$ select api.professional_set_contact('00000000-0000-4000-8000-0000000000f1', p_phone_enc => '\x01c1') $$,
                 'P0001', 'ATTA-IN-0001', 'contato sem envelope, no vínculo que ainda não tem, é recusado');
select lives_ok($$ select api.professional_set_contact('00000000-0000-4000-8000-0000000000f1', p_phone_enc => '\x01c1', p_envelope_id => '00000000-0000-4000-8000-0000000000ec',
                   p_dek_wrapped => '\x01ee', p_kek_version => 1::smallint) $$, 'C cria o envelope com o primeiro contato');

-- a A segue com o contato dela e ativa
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select ok((select phone_enc = '\x01a1' and active from api.professional_get('00000000-0000-4000-8000-0000000000f1')),
          'a A segue com o contato dela e ativa (B e C não mexem nela)');

-- vínculo removido com o token ainda válido: nada (ADR 0001 §2)
select pg_temp.remover_vinculo();
select throws_ok($$ select * from api.professional_get('00000000-0000-4000-8000-0000000000f1') $$, '42501', 'ATTA-AUTH-0004',
                 'vínculo removido: o ADMIN não lê o profissional');

select * from finish();
rollback;
