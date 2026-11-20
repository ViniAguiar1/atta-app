-- MIG-12 (a): schema network fechado, RLS forçada e as regras de identidade (dados fictícios: hmacs de texto inventado).
begin;
select plan(20);

insert into platform.tenant (id, name) values
  ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A'),
  ('00000000-0000-4000-8000-00000000000b', 'Clínica Fictícia B');

-- fechado: ninguém da Data API chega ao schema nem às tabelas
select ok(not has_schema_privilege('authenticated', 'network', 'USAGE'), 'authenticated sem USAGE em network');
select ok(not has_schema_privilege('anon', 'network', 'USAGE'), 'anon sem USAGE em network');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'network' and c.relkind = 'r' and not (c.relrowsecurity and c.relforcerowsecurity)), 0,
          'toda tabela de network com RLS ligada e forçada');
select is((select count(*)::int from information_schema.role_table_grants
           where table_schema = 'network' and grantee in ('anon', 'authenticated', 'PUBLIC')), 0,
          'nenhum grant de tabela em network para anon, authenticated ou public');
select is((select count(*)::int from pg_policies where schemaname = 'network'), 0,
          'nenhuma policy em network: aberto por engano, nada passa');

-- uma pessoa fictícia com CPF, contato cifrado e envelope
insert into network.person (id, cpf_hmac, cpf_masked, cpf_enc, full_name, phone_enc, dek_wrapped, kek_version)
values ('00000000-0000-4000-8000-0000000000e1', sha256('cpf-ficticio-1'), '***.***.*01-11', '\x01aa', 'Marina Teste Fictícia',
        '\x01bb', '\x01cc', 1);

select throws_ok($$ insert into network.person (cpf_hmac, cpf_masked, cpf_enc, full_name, dek_wrapped, kek_version)
                    values (sha256('cpf-ficticio-1'), '***.***.*01-11', '\x01dd', 'Outra Pessoa', '\x01ee', 1) $$,
                 '23505', null, 'o mesmo CPF não vira duas pessoas na rede');
select throws_ok($$ insert into network.person (full_name) values ('Sem Identificação') $$,
                 '23514', null, 'sem CPF, sem RNE e sem marcar incompleto é recusado');
select lives_ok($$ insert into network.person (full_name, is_incomplete) values ('Recém-nascido Fictício', true) $$,
                'sem CPF, marcado como incompleto, é aceito (RN-PAC-02)');
select lives_ok($$ insert into network.person (foreign_doc_type, foreign_doc_hmac, foreign_doc_masked, foreign_doc_enc,
                                              full_name, dek_wrapped, kek_version)
                   values ('crnm', sha256('crnm-ficticio-1'), '****-**1', '\x01aa', 'João Simulado Estrangeiro', '\x01bb', 1) $$,
                'estrangeiro com CRNM é aceito (RN-PAC-02; RNE, RNM ou CRNM)');
select throws_ok($$ insert into network.person (cpf_hmac, full_name) values (sha256('cpf-ficticio-2'), 'Ana Exemplar') $$,
                 '23514', null, 'CPF sem a forma mascarada e o cifrado é recusado');
select throws_ok($$ insert into network.person (cpf_hmac, cpf_masked, cpf_enc, full_name, dek_wrapped, kek_version)
                    values ('\x0102', 'x', '\x01', 'Ana Exemplar', '\x01', 1) $$,
                 '23514', null, 'HMAC que não tem 32 bytes é recusado');
select throws_ok($$ insert into network.person (cpf_hmac, cpf_masked, cpf_enc, full_name)
                    values (sha256('cpf-ficticio-3'), '***', '\x01', 'Ana Exemplar') $$,
                 '23514', null, 'campo cifrado sem envelope (dek_wrapped, kek_version) é recusado');

-- vínculo: um cadastro ativo por pessoa na clínica; a mesma pessoa em duas clínicas
insert into network.person_tenant_link (tenant_id, person_id) values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000e1');
select throws_ok($$ insert into network.person_tenant_link (tenant_id, person_id)
                    values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000e1') $$,
                 '23505', null, 'dois cadastros da mesma pessoa na mesma clínica são recusados (RN-PAC-01)');
select lives_ok($$ insert into network.person_tenant_link (tenant_id, person_id, origin)
                   values ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000e1', 'atta_me') $$,
                'a mesma pessoa pode ter vínculo com outra clínica');
select throws_ok($$ insert into network.person_tenant_link (tenant_id, person_id, origin)
                    values ('00000000-0000-4000-8000-00000000000b', gen_random_uuid(), 'whatsapp') $$,
                 '23514', null, 'origem fora da lista é recusada');

-- verificação: só com validade de até 1 ano (RN-PAC-06)
select throws_ok($$ insert into network.identity_verification (person_id, verified_at, expires_at, proof_hash, result)
                    values ('00000000-0000-4000-8000-0000000000e1', now(), now() + interval '13 months',
                            sha256('prova'), 'aprovada') $$,
                 '23514', null, 'selo com validade acima de 1 ano é recusado');
select lives_ok($$ insert into network.identity_verification (person_id, verified_at, expires_at, proof_hash, result)
                   values ('00000000-0000-4000-8000-0000000000e1', now(), now() + interval '1 year',
                           sha256('prova'), 'aprovada') $$,
                'selo de 1 ano aceito');

-- divergência: motivo curto demais é recusado
select throws_ok($$ insert into network.divergence_report (tenant_id, person_id, reason)
                    values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000e1', 'x') $$,
                 '23514', null, 'divergência sem motivo é recusada');

-- authenticated não lê nada direto, nem com clínica no token
set local role authenticated;
select set_config('request.jwt.claims', '{"tenant_id":"00000000-0000-4000-8000-00000000000a","app_role":"ADMIN"}', true);
select throws_ok($$ select count(*) from network.person $$, '42501', null, 'ADMIN não lê network.person direto');
select throws_ok($$ select count(*) from network.person_tenant_link $$, '42501', null,
                 'ADMIN não lê o vínculo direto (só por api)');
reset role;

select * from finish();
rollback;
