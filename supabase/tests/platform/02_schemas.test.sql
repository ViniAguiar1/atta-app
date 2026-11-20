-- Os 10 schemas da ADR 0001 §1: os expostos com USAGE para anon e authenticated; os fechados sem USAGE para anon,
-- authenticated nem service_role (cada item concede o mínimo na própria migration).
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

select has_schema('platform');
select ok(has_schema_privilege('anon', 'platform', 'USAGE'), 'anon usa o schema exposto platform');
select ok(has_schema_privilege('authenticated', 'platform', 'USAGE'), 'authenticated usa o schema exposto platform');
select has_schema('documents');
select ok(has_schema_privilege('anon', 'documents', 'USAGE'), 'anon usa o schema exposto documents');
select ok(has_schema_privilege('authenticated', 'documents', 'USAGE'), 'authenticated usa o schema exposto documents');
select has_schema('atta_in');
select ok(has_schema_privilege('anon', 'atta_in', 'USAGE'), 'anon usa o schema exposto atta_in');
select ok(has_schema_privilege('authenticated', 'atta_in', 'USAGE'), 'authenticated usa o schema exposto atta_in');
select has_schema('api');
select ok(has_schema_privilege('anon', 'api', 'USAGE'), 'anon usa o schema exposto api');
select ok(has_schema_privilege('authenticated', 'api', 'USAGE'), 'authenticated usa o schema exposto api');
select has_schema('network');
select ok(not has_schema_privilege('anon', 'network', 'USAGE'), 'anon não entra no schema fechado network');
select ok(not has_schema_privilege('authenticated', 'network', 'USAGE'), 'authenticated não entra no schema fechado network');
select ok(not has_schema_privilege('service_role', 'network', 'USAGE'), 'service_role não entra no schema fechado network');
select has_schema('health');
select ok(not has_schema_privilege('anon', 'health', 'USAGE'), 'anon não entra no schema fechado health');
select ok(not has_schema_privilege('authenticated', 'health', 'USAGE'), 'authenticated não entra no schema fechado health');
select ok(not has_schema_privilege('service_role', 'health', 'USAGE'), 'service_role não entra no schema fechado health');
select has_schema('audit');
select ok(not has_schema_privilege('anon', 'audit', 'USAGE'), 'anon não entra no schema fechado audit');
select ok(not has_schema_privilege('authenticated', 'audit', 'USAGE'), 'authenticated não entra no schema fechado audit');
select ok(not has_schema_privilege('service_role', 'audit', 'USAGE'), 'service_role não entra no schema fechado audit');
select has_schema('integrations');
select ok(not has_schema_privilege('anon', 'integrations', 'USAGE'), 'anon não entra no schema fechado integrations');
select ok(not has_schema_privilege('authenticated', 'integrations', 'USAGE'), 'authenticated não entra no schema fechado integrations');
select ok(not has_schema_privilege('service_role', 'integrations', 'USAGE'), 'service_role não entra no schema fechado integrations');
select has_schema('billing');
select ok(not has_schema_privilege('anon', 'billing', 'USAGE'), 'anon não entra no schema fechado billing');
select ok(not has_schema_privilege('authenticated', 'billing', 'USAGE'), 'authenticated não entra no schema fechado billing');
select ok(not has_schema_privilege('service_role', 'billing', 'USAGE'), 'service_role não entra no schema fechado billing');
select has_schema('private');
select ok(not has_schema_privilege('anon', 'private', 'USAGE'), 'anon não entra no schema fechado private');
select ok(not has_schema_privilege('authenticated', 'private', 'USAGE'), 'authenticated não entra no schema fechado private');
select ok(not has_schema_privilege('service_role', 'private', 'USAGE'), 'service_role não entra no schema fechado private');

select * from finish();
rollback;
