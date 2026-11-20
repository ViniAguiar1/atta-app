-- MIG-04 · ADR 0003 e ADR 0001 §2: a trilha de auditoria. Prova o contrato do record_event, a dona sem login e sem
-- BYPASSRLS, o append-only (grant, RLS e gatilho; como service_role, como postgres e como a própria dona) e o hash
-- encadeado que detecta linha adulterada. Só dados fictícios; tudo desfeito no rollback.
begin;
create extension if not exists pgtap with schema extensions;
-- só nesta transação: a dona (e o service_role) chamam as funções do pgTAP quando o teste assume a role deles
grant usage on schema extensions to audit_owner;
grant execute on all functions in schema extensions to audit_owner, service_role;
select plan(45);

-- ---------------------------------------------------------------- dona e posse
select is((select rolcanlogin from pg_roles where rolname = 'audit_owner'), false, 'audit_owner não faz login');
select is((select rolbypassrls from pg_roles where rolname = 'audit_owner'), false, 'audit_owner não tem BYPASSRLS');
select is((select nspowner::regrole::text from pg_namespace where nspname = 'audit'), 'audit_owner', 'o schema audit é da audit_owner');
select is((select relowner::regrole::text from pg_class where oid = 'audit.event'::regclass), 'audit_owner', 'audit.event é da audit_owner');
select is((select relowner::regrole::text from pg_class where oid = 'audit.action'::regclass), 'audit_owner', 'audit.action é da audit_owner');
select is((select proowner::regrole::text from pg_proc where oid = 'audit.record_event(text,text,uuid,jsonb,jsonb,jsonb,uuid)'::regprocedure), 'audit_owner', 'record_event é da audit_owner (não do postgres)');
select ok((select relforcerowsecurity and relrowsecurity from pg_class where oid = 'audit.event'::regclass), 'audit.event com RLS forçada');
select ok((select relforcerowsecurity and relrowsecurity from pg_class where oid = 'audit.action'::regclass), 'audit.action com RLS forçada');
select ok(not pg_has_role('postgres', 'audit_owner', 'USAGE'), 'postgres não herda os privilégios da audit_owner');

-- ---------------------------------------------------------------- grants
select ok(has_function_privilege('postgres', 'audit.record_event(text,text,uuid,jsonb,jsonb,jsonb,uuid)', 'EXECUTE'), 'postgres (dono das funções de api) chama record_event');
select ok(not has_function_privilege('anon', 'audit.record_event(text,text,uuid,jsonb,jsonb,jsonb,uuid)', 'EXECUTE'), 'anon não chama record_event');
select ok(not has_function_privilege('authenticated', 'audit.record_event(text,text,uuid,jsonb,jsonb,jsonb,uuid)', 'EXECUTE'), 'authenticated não chama record_event');
select ok(not has_function_privilege('service_role', 'audit.record_event(text,text,uuid,jsonb,jsonb,jsonb,uuid)', 'EXECUTE'), 'service_role não chama record_event');
select ok(not has_schema_privilege('authenticated', 'audit', 'USAGE') and not has_schema_privilege('service_role', 'audit', 'USAGE') and not has_schema_privilege('anon', 'audit', 'USAGE'), 'anon, authenticated e service_role sem USAGE em audit');
select ok(not has_table_privilege('postgres', 'audit.event', 'UPDATE') and not has_table_privilege('postgres', 'audit.event', 'DELETE') and not has_table_privilege('postgres', 'audit.event', 'TRUNCATE') and not has_table_privilege('postgres', 'audit.event', 'INSERT'), 'postgres sem INSERT, UPDATE, DELETE e TRUNCATE direto na trilha');
select ok(has_table_privilege('postgres', 'audit.event', 'SELECT'), 'postgres lê a trilha (funções de leitura do MIG-06 e testes das trilhas)');
select ok(has_table_privilege('postgres', 'audit.action', 'INSERT') and not has_table_privilege('postgres', 'audit.action', 'UPDATE') and not has_table_privilege('postgres', 'audit.action', 'DELETE'), 'postgres só acrescenta ação ao catálogo (migration)');

-- ---------------------------------------------------------------- contrato do record_event
insert into audit.action (action, kind) values ('teste.leitura', 'access'), ('teste.mudanca', 'change');

select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-4000-8000-0000000000a1","role":"authenticated","tenant_id":"aaaaaaaa-0000-4000-8000-000000000001","app_role":"ADMIN"}', true);
select set_config('request.headers', '{"x-forwarded-for":"203.0.113.7, 10.0.0.1","x-request-id":"req-ficticio-1"}', true);

select lives_ok($$ select audit.record_event('teste.leitura', 'platform.tenant', 'aaaaaaaa-0000-4000-8000-000000000001', '{"motivo":"teste"}') $$, 'access sem before/after grava');
select is((select tenant_id::text from audit.event order by seq desc limit 1), 'aaaaaaaa-0000-4000-8000-000000000001', 'tenant vem do token');
select is((select actor::text from audit.event order by seq desc limit 1), 'a1a1a1a1-0000-4000-8000-0000000000a1', 'ator vem do sub do token');
select is((select app_role from audit.event order by seq desc limit 1), 'ADMIN', 'papel vem do token');
select is((select host(ip) from audit.event order by seq desc limit 1), '203.0.113.7', 'IP é o primeiro do x-forwarded-for');
select is((select request_id from audit.event order by seq desc limit 1), 'req-ficticio-1', 'id de correlação vem do x-request-id');
select lives_ok($$ select audit.record_event('teste.mudanca', 'platform.tenant', 'aaaaaaaa-0000-4000-8000-000000000001', '{}', '{"name":"Alfa"}', '{"name":"Alfa Nova"}') $$, 'change com before/after grava');
select lives_ok($$ select audit.record_event('teste.leitura', 'platform.tenant', null, '{}', null, null, 'aaaaaaaa-0000-4000-8000-000000000001') $$, 'p_tenant_id igual ao do token passa');

select throws_ok($$ select audit.record_event('teste.inexistente', 'platform.tenant', null) $$, '22023', 'audit: ação desconhecida', 'ação fora do catálogo é recusada');
select throws_ok($$ select audit.record_event('teste.leitura', 'platform.tenant', null, '{}', '{"x":1}') $$, '22023', 'audit: before/after só em ação do tipo change', 'access com before é recusado');
select throws_ok($$ select audit.record_event('teste.leitura', 'network.person', null, '{"cpf":"00000000000"}') $$, '22023', 'audit: chave proibida em p_details', 'cpf em p_details é recusado, sem eco do valor');
select throws_ok($$ select audit.record_event('teste.leitura', 'network.person', null, '{"nome":"Fulano Ficticio"}') $$, '22023', 'audit: chave proibida em p_details', 'nome em p_details é recusado');
select throws_ok($$ select audit.record_event('teste.leitura', 'platform.tenant', null, '{}', null, null, 'bbbbbbbb-0000-4000-8000-000000000002') $$, '42501', 'audit: tenant divergente do token', 'p_tenant_id diferente do token é recusado');

-- job, sem JWT: papel system, ator nulo, tenant pelo parâmetro
select set_config('request.jwt.claims', '', true);
select set_config('request.headers', '', true);
select lives_ok($$ select audit.record_event('teste.mudanca', 'atta_in.appointment', null, '{"motivo":"ausencia_automatica"}', null, '{"status":"ausente"}', 'bbbbbbbb-0000-4000-8000-000000000002') $$, 'job sem JWT grava com p_tenant_id');
select is((select app_role || '|' || coalesce(actor::text, 'sem-ator') || '|' || tenant_id from audit.event order by seq desc limit 1), 'system|sem-ator|bbbbbbbb-0000-4000-8000-000000000002', 'job: system, sem ator, tenant do parâmetro');

-- ---------------------------------------------------------------- hash encadeado
select is(audit.verify_chain(), null, 'cadeia íntegra');
select ok((select bool_and(e.prev_hash = coalesce(p.hash, repeat('0', 64))) from audit.event e left join audit.event p on p.seq = (select max(seq) from audit.event x where x.seq < e.seq)), 'cada evento aponta para o hash do anterior');

-- ---------------------------------------------------------------- append-only
set local role service_role;
select throws_ok($$ update audit.event set details = '{}' $$, '42501', null, 'service_role não altera a trilha');
select throws_ok($$ delete from audit.event $$, '42501', null, 'service_role não apaga a trilha');
select throws_ok($$ truncate audit.event $$, '42501', null, 'service_role não trunca a trilha');
reset role;

select throws_ok($$ update audit.event set details = '{}' $$, '42501', null, 'postgres não altera a trilha (sem grant, sem herança)');

set local role audit_owner;
select throws_ok($$ truncate audit.event $$, '42501', 'a trilha de auditoria é só de inserção (TRUNCATE)', 'nem a dona trunca: o gatilho recusa');
delete from audit.action where action = 'teste.leitura';
select is((select count(*)::int from audit.action where action = 'teste.leitura'), 1, 'nem a dona apaga ação do catálogo (RLS forçada; e o gatilho, sem ela)');

-- camada 1 (RLS forçada, sem policy de UPDATE e DELETE): o UPDATE e o DELETE da dona não alcançam nenhuma linha
update audit.event set details = '{"x":1}';
select is((select count(*)::int from audit.event where details ? 'x'), 0, 'dona: UPDATE não alcança nenhuma linha (RLS forçada)');
delete from audit.event;
select ok((select count(*) from audit.event) >= 4, 'dona: DELETE não alcança nenhuma linha (RLS forçada)');

-- camada 2 (gatilho): mesmo sem o FORCE, o gatilho recusa UPDATE e DELETE
alter table audit.event no force row level security;
select throws_ok($$ update audit.event set details = '{}' $$, '42501', 'a trilha de auditoria é só de inserção (UPDATE)', 'sem o FORCE, o gatilho recusa o UPDATE');
select throws_ok($$ delete from audit.event $$, '42501', 'a trilha de auditoria é só de inserção (DELETE)', 'sem o FORCE, o gatilho recusa o DELETE');

-- adulteração: a dona também desliga o gatilho (o que um invasor com a dona faria) e muda uma linha do meio
alter table audit.event disable trigger event_append_only;
update audit.event set details = '{"motivo":"adulterado"}' where seq = (select min(seq) + 1 from audit.event);
reset role;
select is(audit.verify_chain(), (select min(seq) + 1 from audit.event), 'linha adulterada: verify_chain aponta o seq dela');

select * from finish();
rollback;
