-- MIG-21c (parte 1): Termo de Autorização do profissional, modelo de sistema e gravação assinada. PDD v206 §10.4.3;
-- decisões do CTO de 21/11; ADR 0001 §1. Só dado fictício.
begin;
select plan(35);

create function pg_temp.detalhe(p_sql text) returns text language plpgsql as $$
declare d text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics d = pg_exception_detail;
  return d;
end $$;

-- Código ATTA pelos vetores do atta-core (tests/vectors/atta_sign_v1)
select is(private.atta_code_from_sha256('95d0d4842a89fbc60bfac2d3e5a8fe3a9c592f69f392debf9c506187087ae3e8'),
          'ATTA-JQ8D-911A-H7XW', 'Código ATTA do caso-01');
select is(private.atta_code_from_sha256('4ca2539340575ba8069afdc607b8884d8bafa9d5d5cc1efef19d9499e80f0dc4'),
          'ATTA-9JH5-74T0-AXDT', 'Código ATTA do caso-02');
select is(private.atta_code_from_sha256('não é hash'), null, 'entrada fora do formato: nulo');

insert into platform.tenant (id, name, legal_name, cnpj) values
  ('00000000-0000-4000-8000-0000000005a1', 'Clínica Fictícia Autorização A', 'Clínica Fictícia Autorização A Ltda', '00000000050105'),
  ('00000000-0000-4000-8000-0000000005b1', 'Clínica Fictícia Autorização B', 'Clínica Fictícia Autorização B Ltda', '00000000050296');

-- seed ---------------------------------------------------------------------------------------------------------------
select ok(private.authorization_template_ready('00000000-0000-4000-8000-0000000005a1'),
          'clínica nova já nasce com o modelo de sistema do Termo (seed, decisão do CTO)');
select results_eq($$ select t.kind, t.status, t.current_version, t.required, t.frequency from documents.template t
                    where t.tenant_id = '00000000-0000-4000-8000-0000000005a1' $$,
                  $$ values ('termo_de_autorizacao', 'ativo', 1, true, 'unica') $$,
                  'um modelo só: Ativo, versão 1, obrigatório');
select ok((select v.body like '%{{clinica.razao_social}}%' and v.body like '%prazo indeterminado%'
                  and v.body like '%efeito prospectivo%' and v.body like '%log de auditoria%'
                  and v.body like '%continuam vigentes%'
           from documents.template_version v where v.tenant_id = '00000000-0000-4000-8000-0000000005a1'),
          'texto do simulador com as cláusulas do PDD §10.4.3 e os campos da clínica');
select private.seed_authorization_template('00000000-0000-4000-8000-0000000005a1');
select is((select count(*)::int from documents.template where tenant_id = '00000000-0000-4000-8000-0000000005a1'), 1,
          'o seed é idempotente');
-- clínica criada numa sessão com usuário (onboarding, backoffice): o seed passa pela trava do #188 pela marca de sistema
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
insert into platform.tenant (id, name) values ('00000000-0000-4000-8000-0000000005c0', 'Clínica Fictícia Criada com Token');
select ok(private.authorization_template_ready('00000000-0000-4000-8000-0000000005c0'),
          'clínica criada com usuário no token também nasce com o termo de sistema');
select is(pg_temp.detalhe($$ update documents.template set title = 'Outro' where tenant_id = '00000000-0000-4000-8000-0000000005c0' $$),
          'kind', 'fora do seed, com usuário no token, a trava continua recusando (a marca não sobra na transação)');
select set_config('request.jwt.claims', '', true);

-- montagem fictícia: profissional, vínculo, chave do selo, payload ---------------------------------------------------
insert into platform.professional (id, display_name, council, council_uf, council_number, cpf_hmac, cpf_masked, cpf_enc,
                                   email_enc, dek_wrapped, kek_version)
values ('00000000-0000-4000-8000-0000000005f1', 'Dra. Fictícia Autorização', 'cro', 'SP', '11111', sha256('cpf-prof-aut'::bytea),
        '···.···.000-02', '\x01', '\x01', '\x01', 1);
insert into platform.professional_tenant_link (id, tenant_id, professional_id, invite_email_hmac, invite_email_enc,
                                               envelope_id, dek_wrapped, kek_version, propass_completed_at,
                                               privacy_notice_version, privacy_notice_ack_at)
values ('00000000-0000-4000-8000-0000000005d1', '00000000-0000-4000-8000-0000000005a1', '00000000-0000-4000-8000-0000000005f1',
        sha256('dra-aut@a.test'::bytea), '\x01', gen_random_uuid(), '\x01', 1, now(), 'v1', now());
insert into documents.seal_key (kid, public_key_spki, valid_from)
values ('staging-seal-teste-aut', '\x302a300506032b6570032100'::bytea || sha256('chave-ficticia'::bytea), '2026-01-01');

create function pg_temp.payload(p_doc uuid, p_tenant uuid default '00000000-0000-4000-8000-0000000005a1',
                                p_link uuid default '00000000-0000-4000-8000-0000000005d1',
                                p_stroke text default repeat('a', 64), p_signed_at text default '2026-11-21T10:00:00.000Z',
                                p_council text default 'CRO-SP 11111')
returns bytea language sql as $$
  select convert_to(jsonb_build_object(
    'atta_sign_version', '1',
    'document', jsonb_build_object('id', p_doc, 'type', 'termo_de_autorizacao', 'template_id', v.template_id,
                                   'template_version', v.version, 'body_sha256', v.body_sha256,
                                   'body_normalization', v.body_normalization),
    'tenant', (select jsonb_build_object('legal_name', c.legal_name, 'trade_name', c.name,
                                         'cnpj', regexp_replace(c.cnpj, '^(..)(...)(...)(....)(..)$', '\1.\2.\3/\4-\5'))
               from platform.tenant c where c.id = p_tenant),
    'parties', jsonb_build_array(jsonb_build_object('ref', 'p1', 'role', 'professional', 'name', 'Dra. Fictícia Autorização',
                                                    'council', p_council)),
    'signature', jsonb_build_object('signer', 'p1', 'level', 'atta_sign', 'signed_at', p_signed_at, 'stroke_sha256', p_stroke),
    'context', jsonb_build_object('product', 'atta_in', 'context_type', 'professional_authorization', 'context_id', p_link)
  )::text, 'UTF8')
  from documents.template_version v where v.tenant_id = p_tenant and v.kind = 'termo_de_autorizacao'
$$;
create function pg_temp.traco(p_doc uuid, p_prefixo text default '00000000-0000-4000-8000-0000000005a1') returns jsonb language sql as $$
  select jsonb_build_object('storage_path', p_prefixo || '/' || p_doc || '/assinatura.png',
                            'sha256_plain', repeat('a', 64), 'size_bytes', 2048, 'dek_wrapped', 'abcd', 'kek_version', 1)
$$;
create function pg_temp.gravar(p_doc uuid, p_payload bytea, p_code text default null, p_kid text default 'staging-seal-teste-aut',
                               p_link uuid default '00000000-0000-4000-8000-0000000005d1',
                               p_tenant uuid default '00000000-0000-4000-8000-0000000005a1') returns uuid language sql as $$
  select private.document_insert_signed_authorization(p_tenant, p_link, p_doc, p_payload,
    coalesce(p_code, private.atta_code_from_sha256(encode(sha256(p_payload), 'hex'))), p_kid,
    sha512('selo-ficticio'::bytea), pg_temp.traco(p_doc))
$$;

-- permissões ---------------------------------------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'private.document_insert_signed_authorization(uuid, uuid, uuid, bytea, text, text, bytea, jsonb)', 'EXECUTE')
          and not has_function_privilege('service_role', 'private.document_insert_signed_authorization(uuid, uuid, uuid, bytea, text, text, bytea, jsonb)', 'EXECUTE')
          and not has_function_privilege('service_role', 'private.authorization_template_ready(uuid)', 'EXECUTE')
          and not has_function_privilege('service_role', 'private.seed_authorization_template(uuid)', 'EXECUTE'),
          'nada disso tem EXECUTE para os papéis da API: só o api.propass_submit (dono) chama');

-- recusas (cada uma volta tudo) --------------------------------------------------------------------------------------
select is(pg_temp.detalhe($$ select pg_temp.gravar('00000000-0000-4000-8000-0000000005c9',
            pg_temp.payload('00000000-0000-4000-8000-0000000005c9'), 'ATTA-0000-0000-0000') $$), 'atta_code',
          'Código ATTA que não sai do hash é recusado');
select is(pg_temp.detalhe($$ select pg_temp.gravar('00000000-0000-4000-8000-0000000005c9',
            pg_temp.payload('00000000-0000-4000-8000-0000000005c9'), null, 'staging-seal-inexistente') $$), 'seal',
          'chave do selo desconhecida é recusada');
select is(pg_temp.detalhe($$ select pg_temp.gravar('00000000-0000-4000-8000-0000000005c9',
            pg_temp.payload('00000000-0000-4000-8000-0000000005c9', p_signed_at => '2025-06-01T00:00:00.000Z')) $$), 'seal',
          'chave do selo que ainda não valia no momento da assinatura é recusada');
select is(pg_temp.detalhe($$ select pg_temp.gravar('00000000-0000-4000-8000-0000000005c9',
            pg_temp.payload('00000000-0000-4000-8000-0000000005c8')) $$), 'payload',
          'payload de outro documento é recusado');
select is(pg_temp.detalhe($$ select pg_temp.gravar('00000000-0000-4000-8000-0000000005c9',
            pg_temp.payload('00000000-0000-4000-8000-0000000005c9', p_stroke => repeat('b', 64))) $$), 'payload',
          'assinatura desenhada diferente da do payload é recusada');
select is(pg_temp.detalhe($$ select pg_temp.gravar('00000000-0000-4000-8000-0000000005c9',
            pg_temp.payload('00000000-0000-4000-8000-0000000005c9', p_link => gen_random_uuid())) $$), 'payload',
          'payload de outro vínculo é recusado');
select is(pg_temp.detalhe($$ select pg_temp.gravar('00000000-0000-4000-8000-0000000005c9',
            pg_temp.payload('00000000-0000-4000-8000-0000000005c9'), p_link => gen_random_uuid()) $$), 'professional_link_id',
          'vínculo inexistente é recusado');
select is(pg_temp.detalhe($$ select pg_temp.gravar('00000000-0000-4000-8000-0000000005c9',
            convert_to('{não é json', 'UTF8')) $$), 'payload', 'payload que não é JSON é recusado');
select is(pg_temp.detalhe($$ select private.document_insert_signed_authorization('00000000-0000-4000-8000-0000000005a1',
            '00000000-0000-4000-8000-0000000005d1', '00000000-0000-4000-8000-0000000005c9',
            pg_temp.payload('00000000-0000-4000-8000-0000000005c9'),
            private.atta_code_from_sha256(encode(sha256(pg_temp.payload('00000000-0000-4000-8000-0000000005c9')), 'hex')),
            'staging-seal-teste-aut', sha512('selo-ficticio'::bytea),
            pg_temp.traco('00000000-0000-4000-8000-0000000005c9', '00000000-0000-4000-8000-0000000005b1')) $$), 'stroke',
          'traço no Storage de outra clínica é recusado');
-- a clínica do payload é a do cadastro (ADR 0001, "Dados da clínica e texto do Termo")
update platform.tenant set legal_name = 'Outra Razão Social Ltda' where id = '00000000-0000-4000-8000-0000000005a1';
select is(pg_temp.detalhe($$ select pg_temp.gravar('00000000-0000-4000-8000-0000000005c9',
            convert_to(replace(convert_from(pg_temp.payload('00000000-0000-4000-8000-0000000005c9'), 'UTF8'),
                               'Outra Razão Social Ltda', 'Clínica Fictícia Autorização A Ltda'), 'UTF8')) $$), 'payload',
          'razão social do payload diferente da do cadastro é recusada');
update platform.tenant set legal_name = null where id = '00000000-0000-4000-8000-0000000005a1';
select is(pg_temp.detalhe($$ select pg_temp.gravar('00000000-0000-4000-8000-0000000005c9',
            pg_temp.payload('00000000-0000-4000-8000-0000000005c9')) $$), 'legal_name',
          'clínica sem razão social: nada se assina');
update platform.tenant set legal_name = 'Clínica Fictícia Autorização A Ltda', cnpj = null where id = '00000000-0000-4000-8000-0000000005a1';
select is(pg_temp.detalhe($$ select pg_temp.gravar('00000000-0000-4000-8000-0000000005c9',
            pg_temp.payload('00000000-0000-4000-8000-0000000005c9')) $$), 'cnpj',
          'clínica sem CNPJ: nada se assina');
update platform.tenant set cnpj = '00000000050105' where id = '00000000-0000-4000-8000-0000000005a1';
-- revisões do #192 e do #208 (MIG-21c parte 2)
select is(pg_temp.detalhe($$ select pg_temp.gravar('00000000-0000-4000-8000-0000000005c9',
            pg_temp.payload('00000000-0000-4000-8000-0000000005c9', p_council => 'CRM-RJ 99999')) $$), 'payload',
          'signatário com registro de outro profissional é recusado (o termo nunca nomeia outra pessoa)');
select is(pg_temp.detalhe($$ select private.document_insert_signed_authorization('00000000-0000-4000-8000-0000000005a1',
            '00000000-0000-4000-8000-0000000005d1', '00000000-0000-4000-8000-0000000005c9',
            pg_temp.payload('00000000-0000-4000-8000-0000000005c9'),
            private.atta_code_from_sha256(encode(sha256(pg_temp.payload('00000000-0000-4000-8000-0000000005c9')), 'hex')),
            'staging-seal-teste-aut', sha512('selo-ficticio'::bytea),
            pg_temp.traco('00000000-0000-4000-8000-0000000005c9') || '{"storage_path": "00000000-0000-4000-8000-0000000005a1/00000000-0000-4000-8000-0000000005c9/..png"}') $$),
          'stroke', 'caminho do traço com ".." é recusado');
select is(pg_temp.detalhe($$ select private.document_insert_signed_authorization('00000000-0000-4000-8000-0000000005a1',
            '00000000-0000-4000-8000-0000000005d1', '00000000-0000-4000-8000-0000000005c9',
            pg_temp.payload('00000000-0000-4000-8000-0000000005c9'),
            private.atta_code_from_sha256(encode(sha256(pg_temp.payload('00000000-0000-4000-8000-0000000005c9')), 'hex')),
            'staging-seal-teste-aut', sha512('selo-ficticio'::bytea),
            pg_temp.traco('00000000-0000-4000-8000-0000000005c9') || '{"size_bytes": 524289}') $$),
          'stroke', 'traço acima de 512 KiB é recusado');
select is((select count(*)::int from documents.document where professional_link_id = '00000000-0000-4000-8000-0000000005d1'), 0,
          'nenhuma recusa deixou documento');

-- gravação -----------------------------------------------------------------------------------------------------------
select is(pg_temp.gravar('00000000-0000-4000-8000-0000000005c1', pg_temp.payload('00000000-0000-4000-8000-0000000005c1')),
          '00000000-0000-4000-8000-0000000005c1'::uuid, 'grava o termo assinado');
select results_eq($$ select status, person_id is null, folder_section is null from documents.document
                    where id = '00000000-0000-4000-8000-0000000005c1' $$,
                  $$ values ('assinado_definitivo', true, true) $$,
                  '§10.4.3: nasce Assinado definitivo, do vínculo do profissional, fora da Pasta do Paciente');
select ok((select e.atta_code = private.atta_code_from_sha256(e.evidence_sha256) and e.signed_at = '2026-11-21T10:00:00Z'
           from documents.evidence e where e.document_id = '00000000-0000-4000-8000-0000000005c1'),
          'evidência com o hash, o Código ATTA e o momento do payload');
select is((select count(*)::int from documents.seal s join documents.evidence e on e.id = s.evidence_id
           where e.document_id = '00000000-0000-4000-8000-0000000005c1'), 1, 'selo gravado');
select results_eq($$ select role, party_ref, sha256_plain from documents.stored_object
                    where document_id = '00000000-0000-4000-8000-0000000005c1' $$,
                  $$ values ('signature_stroke', 'p1', repeat('a', 64)) $$,
                  'a assinatura desenhada fica presa ao termo (é a que se reaproveita)');
select is((select count(*)::int from audit.event where action = 'document.sign_authorization'
           and entity_id = '00000000-0000-4000-8000-0000000005c1'), 1, 'a gravação vai à trilha');
select is(pg_temp.detalhe($$ select pg_temp.gravar('00000000-0000-4000-8000-0000000005c2',
            pg_temp.payload('00000000-0000-4000-8000-0000000005c2')) $$), 'professional_link_id',
          'um termo vigente por vínculo');
-- a mesma garantia pelo índice, mesmo que dois envios simultâneos passem juntos pela conferência
select throws_ok($$ insert into documents.document (tenant_id, template_version_id, professional_link_id, status)
                    select '00000000-0000-4000-8000-0000000005a1', template_version_id, professional_link_id, 'assinado_definitivo'
                    from documents.document where id = '00000000-0000-4000-8000-0000000005c1' $$,
                 '23505', null, 'índice único: um termo vigente por vínculo, também na corrida');

-- clínica sem o modelo de sistema ------------------------------------------------------------------------------------
update documents.template set status = 'inativo' where tenant_id = '00000000-0000-4000-8000-0000000005b1';
select is(pg_temp.detalhe($$ select private.document_insert_signed_authorization('00000000-0000-4000-8000-0000000005b1',
            gen_random_uuid(), gen_random_uuid(), '\x7b7d', 'ATTA-0000-0000-0000', 'x', '\x00', '{}') $$),
          'authorization_template', 'clínica sem o modelo Ativo: authorization_template (o submit volta inteiro)');

select * from finish();
rollback;
