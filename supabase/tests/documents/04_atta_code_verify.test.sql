-- MIG-24: verificação pública do Código ATTA (PDD v206 §18.6; ADR 0006 §6). Payload sintético que passa nas travas
-- da evidência (#62); só dado fictício; rollback no fim.
begin;
select plan(21);

insert into platform.tenant (id, name) values ('aaaaaaaa-0000-4000-8000-0000000000f6', 'Nome Atual Da Clínica Fictícia');
insert into network.person (id, full_name, is_incomplete) values ('cccccccc-0000-4000-8000-0000000000f6', 'Paciente Ficticio', true);
insert into network.person_tenant_link (tenant_id, person_id)
values ('aaaaaaaa-0000-4000-8000-0000000000f6', 'cccccccc-0000-4000-8000-0000000000f6');
insert into documents.template (id, tenant_id, kind, title, frequency, required, draft_body)
values ('dddddddd-0000-4000-8000-0000000000f6', 'aaaaaaaa-0000-4000-8000-0000000000f6', 'tcle', 'TCLE Ficticio',
        'por_procedimento', true, 'Texto fictício.');
insert into documents.template_version (id, tenant_id, template_id, version, kind, title, frequency, required, body,
                                        body_sha256, published_by)
values ('dddddddd-0000-4000-8000-0000000000f7', 'aaaaaaaa-0000-4000-8000-0000000000f6',
        'dddddddd-0000-4000-8000-0000000000f6', 1, 'tcle', 'TCLE Ficticio', 'por_procedimento', true, 'Texto fictício.',
        encode(sha256(convert_to('Texto fictício.', 'UTF8')), 'hex'), 'cccccccc-0000-4000-8000-0000000000f6');
insert into documents.document (id, tenant_id, template_version_id, person_id, folder_section) values
  ('eeeeeeee-0000-4000-8000-0000000000f1', 'aaaaaaaa-0000-4000-8000-0000000000f6', 'dddddddd-0000-4000-8000-0000000000f7',
   'cccccccc-0000-4000-8000-0000000000f6', 'termos'),
  ('eeeeeeee-0000-4000-8000-0000000000f2', 'aaaaaaaa-0000-4000-8000-0000000000f6', 'dddddddd-0000-4000-8000-0000000000f7',
   'cccccccc-0000-4000-8000-0000000000f6', 'termos');
update documents.document set status = 'pre_assinado' where tenant_id = 'aaaaaaaa-0000-4000-8000-0000000000f6';
update documents.document set status = 'cancelado', cancel_reason = 'paciente_desistiu', cancelled_at = now()
where id = 'eeeeeeee-0000-4000-8000-0000000000f2';

create function pg_temp.payload(p_trade text) returns bytea language sql as $$
  select convert_to(
    '{"atta_sign_version":"1","document":{"template_version":1,"type":"tcle"},'
    || '"parties":[{"identity_document":{"masked":"***.***.789-01","type":"cpf"},"name":"Paciente Ficticio"}],'
    || '"signature":{"level":"atta_sign","signed_at":"2026-11-20T14:05:09.412Z"},'
    || '"tenant":{"cnpj":"00.000.000/0001-91","legal_name":"Clinica Ficticia Ltda","trade_name":' || to_json(p_trade)::text || '}}',
    'UTF8')
$$;
insert into documents.evidence (tenant_id, document_id, atta_sign_version, payload_canonical, evidence_sha256, atta_code,
                                signed_at)
values
  ('aaaaaaaa-0000-4000-8000-0000000000f6', 'eeeeeeee-0000-4000-8000-0000000000f1', '1', pg_temp.payload('Clinica Ficticia'),
   encode(sha256(pg_temp.payload('Clinica Ficticia')), 'hex'), 'ATTA-7K3M-9QPX-2B4D', '2026-11-20T14:05:09.412Z'),
  ('aaaaaaaa-0000-4000-8000-0000000000f6', 'eeeeeeee-0000-4000-8000-0000000000f2', '1', pg_temp.payload(''),
   encode(sha256(pg_temp.payload('')), 'hex'), 'ATTA-8R2T-5VWN-6HJC', '2026-11-20T14:05:09.412Z');

create function pg_temp.linha(p_code text) returns text language sql as $$
  select row_to_json(v)::text from api.atta_code_verify(p_code) v
$$;
do $$ begin
  execute format('grant execute on all functions in schema %I to service_role', pg_my_temp_schema()::regnamespace);
end $$;

-- permissões --------------------------------------------------------------------------------------------------------
select ok(has_function_privilege('service_role', 'api.atta_code_verify(text)', 'EXECUTE'), 'o servidor chama');
select ok(not has_function_privilege('anon', 'api.atta_code_verify(text)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'api.atta_code_verify(text)', 'EXECUTE'),
          'o navegador não chama direto: não pula o limite por IP');
select is((select prosecdef and proconfig @> array['search_path=""'] from pg_proc
           where oid = 'api.atta_code_verify(text)'::regprocedure), true, 'SECURITY DEFINER com search_path vazio');

insert into documents.seal_key (kid, public_key_spki, valid_from)
values ('staging-seal-teste04', decode(repeat('11', 44), 'hex'), '2026-11-01T00:00:00Z');
insert into documents.seal (tenant_id, evidence_id, kid, signature)
select e.tenant_id, e.id, 'staging-seal-teste04', decode(repeat('22', 64), 'hex')
from documents.evidence e where e.atta_code = 'ATTA-7K3M-9QPX-2B4D';

set local role service_role;

-- código que existe: as 9 colunas, do que foi assinado (a integridade é calculada no servidor, ADR 0007) ---------
select is((select array_agg(k order by k) from json_object_keys(pg_temp.linha('ATTA-7K3M-9QPX-2B4D')::json) k),
          array['document_type', 'evidence_sha256', 'exists', 'level', 'signed_at', 'status', 'template_version',
                'tenant_cnpj', 'tenant_trade_name'], 'as 8 chaves da ADR 0006 §6 e o CNPJ (ADR 0007)');
select results_eq(
  $$ select "exists", tenant_trade_name, document_type, template_version, signed_at, status, level, tenant_cnpj
     from api.atta_code_verify('ATTA-7K3M-9QPX-2B4D') $$,
  $$ values (true, 'Clinica Ficticia'::text, 'tcle'::text, 1, '2026-11-20T14:05:09.412Z'::text, 'pre_assinado'::text,
             'atta_sign'::text, '00.000.000/0001-91'::text) $$,
  'existência, estabelecimento assinado (nome e CNPJ do payload), tipo, versão, momento, estado e nível');
select is((select evidence_sha256 from api.atta_code_verify('ATTA-7K3M-9QPX-2B4D')),
          encode(sha256(pg_temp.payload('Clinica Ficticia')), 'hex'), 'integridade: o sha256 da evidência');
select ok(pg_temp.linha('ATTA-7K3M-9QPX-2B4D') !~ '(Paciente|789-01|cpf|Nome Atual)',
          'nenhum dado pessoal, conteúdo ou nome atual na resposta (o CNPJ da clínica é o assinado)');
select is((select tenant_trade_name from api.atta_code_verify('ATTA-8R2T-5VWN-6HJC')), 'Clinica Ficticia Ltda',
          'sem nome fantasia assinado, vale a razão social assinada (nunca o nome atual da clínica)');
select is((select status from api.atta_code_verify('ATTA-8R2T-5VWN-6HJC')), 'cancelado',
          'documento cancelado: só a existência e o estado (lacuna §18.6 com a PO)');

-- inexistente e malformado: a mesma resposta ---------------------------------------------------------------------
select is(pg_temp.linha('ATTA-0000-0000-0000'),
          '{"exists":false,"tenant_trade_name":null,"document_type":null,"template_version":null,"signed_at":null,'
          || '"status":null,"evidence_sha256":null,"level":null,"tenant_cnpj":null}', 'código inexistente: exists false e o resto nulo');
select is(pg_temp.linha('nao-e-codigo'), pg_temp.linha('ATTA-0000-0000-0000'), 'malformado responde igual ao inexistente');
select is(pg_temp.linha(null), pg_temp.linha('ATTA-0000-0000-0000'), 'vazio responde igual');
select is(pg_temp.linha('atta-7k3m-9qpx-2b4d'), pg_temp.linha('ATTA-0000-0000-0000'),
          'o banco só aceita o código normalizado (a normalização é do servidor)');

-- material da integridade (ADR 0007): só para o servidor, e sem trilha ---------------------------------------------
select is((select decode(payload_canonical_b64, 'base64') from api.atta_code_material('ATTA-7K3M-9QPX-2B4D')),
          pg_temp.payload('Clinica Ficticia'), 'material: os bytes exatos do payload, em base64 sem quebra');
select is((select seals || seal_keys from api.atta_code_material('ATTA-7K3M-9QPX-2B4D')),
          jsonb_build_array(
            jsonb_build_object('kid', 'staging-seal-teste04', 'sig_b64', translate(encode(decode(repeat('22', 64), 'hex'), 'base64'), e'\n', '')),
            jsonb_build_object('kid', 'staging-seal-teste04', 'alg', 'Ed25519',
                               'public_key_spki_b64', encode(decode(repeat('11', 44), 'hex'), 'base64'),
                               'valid_from', '2026-11-01T00:00:00.000Z', 'valid_until', null)),
          'material: o selo e a chave do manifesto desse kid, com datas em ISO UTC com ms');
select is((select seals from api.atta_code_material('ATTA-8R2T-5VWN-6HJC')), '[]'::jsonb,
          'evidência sem selo: lista vazia (a integridade sai null)');
select is((select count(*)::int from api.atta_code_material('ATTA-0000-0000-0000')), 0, 'inexistente: nenhum material');
reset role;
select ok(has_function_privilege('service_role', 'api.atta_code_material(text)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'api.atta_code_material(text)', 'EXECUTE')
          and not has_function_privilege('anon', 'api.atta_code_material(text)', 'EXECUTE')
          and not has_function_privilege('service_role', 'private.atta_code_material(text)', 'EXECUTE'),
          'material só pelo servidor (service_role), e o núcleo em private sem EXECUTE para a API');

-- trilha ------------------------------------------------------------------------------------------------------------
select is((select count(*)::int from audit.event where action = 'atta_code.verify'
           and tenant_id = 'aaaaaaaa-0000-4000-8000-0000000000f6' and details = '{"found": true}'::jsonb), 6,
          'consulta encontrada vai à trilha com o tenant do documento, só com found');
select is((select count(*)::int from audit.event where action = 'atta_code.verify'
           and (tenant_id is null or details <> '{"found": true}'::jsonb)), 0, 'consulta sem resultado não vai à trilha (não disputa a cabeça da cadeia)');

set local role authenticated;
select throws_ok($$ select * from api.atta_code_verify('ATTA-7K3M-9QPX-2B4D') $$, '42501', null,
                 'authenticated chamando direto é barrado');
reset role;

select * from finish();
rollback;
