-- MIG-04 (S4-1): a trilha recusa dado pessoal e de saúde em p_details, p_before e p_after (ADR 0003 §2).
-- Só dados fictícios (CPFs de dígito inválido); rollback no fim.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into audit.action (action, kind, scope) values ('teste.leitura_s41', 'access', 'network'), ('teste.mudanca_s41', 'change', 'network');

-- p_details: chaves novas da lista, em qualquer nível
select throws_ok($$ select audit.record_event('teste.leitura_s41', 'network.person', null, '{"cpf_masked":"···.···.321-00"}') $$, '22023', 'audit: chave proibida em p_details', 'cpf_masked em p_details é recusado');
select throws_ok($$ select audit.record_event('teste.leitura_s41', 'network.person', null, '{"pessoa":{"birth_date":"2000-01-01"}}') $$, '22023', 'audit: chave proibida em p_details', 'birth_date aninhado é recusado');
select throws_ok($$ select audit.record_event('teste.leitura_s41', 'network.person', null, '{"rne":"V1234567"}') $$, '22023', 'audit: chave proibida em p_details', 'rne é recusado');
select throws_ok($$ select audit.record_event('teste.leitura_s41', 'network.person', null, '{"lista":[{"whatsapp":"+5511900000000"}]}') $$, '22023', 'audit: chave proibida em p_details', 'whatsapp dentro de array é recusado');
select throws_ok($$ select audit.record_event('teste.leitura_s41', 'network.person', null, '{"foreign_doc_kind":"rnm"}') $$, '22023', 'audit: chave proibida em p_details', 'foreign_doc_* é recusado');
select throws_ok($$ select audit.record_event('teste.leitura_s41', 'network.person', null, '{"local_phone_enc":"AQ=="}') $$, '22023', 'audit: chave proibida em p_details', 'local_* é recusado');

-- p_before/p_after: identificador em claro e dado de saúde
select throws_ok($$ select audit.record_event('teste.mudanca_s41', 'network.person', null, '{}', '{"cpf":"x"}', '{"cpf":"y"}') $$, '22023', 'audit: chave proibida em p_before/p_after', 'cpf em claro no antes/depois é recusado');
select throws_ok($$ select audit.record_event('teste.mudanca_s41', 'health.answer', null, '{}', null, '{"value_enc":"AQ=="}') $$, '22023', 'audit: chave proibida em p_before/p_after', 'resposta de saúde (nem cifrada) no depois é recusada');

-- valor com forma de CPF, com chave inocente
select throws_ok($$ select audit.record_event('teste.leitura_s41', 'network.person', null, '{"motivo":"12345678901"}') $$, '22023', 'audit: valor com forma de CPF', 'CPF sem máscara num motivo é recusado');
select throws_ok($$ select audit.record_event('teste.leitura_s41', 'network.person', null, '{"motivo":"123.456.789-01"}') $$, '22023', 'audit: valor com forma de CPF', 'CPF com máscara de digitação é recusado');
select throws_ok($$ select audit.record_event('teste.mudanca_s41', 'network.person', null, '{}', '{"obs":"x"}', '{"obs":"987.654.321-00"}') $$, '22023', 'audit: valor com forma de CPF', 'CPF no depois é recusado');

-- ajustes da Segurança no #48
select throws_ok($$ select audit.record_event('teste.mudanca_s41', 'network.person', null, '{"reason":"corrigido o 123.456.789-01 no cadastro"}') $$, '22023', 'audit: valor com forma de CPF', 'CPF no meio de um motivo livre é recusado');
select throws_ok($$ select audit.record_event('teste.leitura_s41', 'network.person', null, '{"CPF":"x"}') $$, '22023', 'audit: chave proibida em p_details', 'chave em maiúsculas é recusada');
select throws_ok($$ select audit.record_event('teste.leitura_s41', 'network.person', null, '{"phone_hmac":"x"}') $$, '22023', 'audit: chave proibida em p_details', '*_hmac genérico é recusado');
select throws_ok($$ select audit.record_event('teste.leitura_s41', 'platform.access_grant', null, '{"pin_mac":"x"}') $$, '22023', 'audit: chave proibida em p_details', 'pin_mac é recusado');
select throws_ok($$ select audit.record_event('teste.mudanca_s41', 'platform.access_grant', null, '{}', null, '{"secret_hash":"x"}') $$, '22023', 'audit: chave proibida em p_before/p_after', 'secret_hash no depois é recusado');
-- e o que NÃO pode virar falso positivo: UUID e hash hex com corrida de 11 dígitos
select lives_ok($$ select audit.record_event('teste.leitura_s41', 'network.person', null, '{"grant_id":"0199c1b4-0000-7000-8000-a12345678901"}') $$, 'UUID com 11 dígitos seguidos no fim não é CPF');
select lives_ok($$ select audit.record_event('teste.leitura_s41', 'documents.evidence', null, '{"evidence_sha256":"ab12345678901cd0000000000000000000000000000000000000000000000000ef"}') $$, 'hash hex com corrida de 11 dígitos não é CPF');
select lives_ok($$ select audit.record_event('teste.leitura_s41', 'network.person', null, '{"phone_masked":"+55 11 •••••-0000","ref":"pedido 123456789012345"}') $$, 'corrida de 15 dígitos (limite de dígito) e telefone mascarado passam');

-- o que pode continuar passando
select lives_ok($$ select audit.record_event('teste.leitura_s41', 'network.person', null, '{"motivo":"teste","ids":["a","b"],"quantidade":12345678901}') $$, 'motivo, ids e número (não texto) passam');
select lives_ok($$ select audit.record_event('teste.mudanca_s41', 'network.person', null, '{}', '{"cpf_masked":"···.···.321-00","full_name":"Fulano Ficticio"}', '{"cpf_masked":"···.···.321-00","full_name":"Fulano Novo"}') $$, 'antes/depois com campo em claro permitido pela ADR (nome, máscara) passa');

select * from finish();
rollback;
