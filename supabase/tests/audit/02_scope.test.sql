-- MIG-04 (follow-up) · ADR 0003 §1: evento sem tenant só para ação de rede. Só dados fictícios; rollback no fim.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select has_column('audit', 'action', 'scope', 'audit.action tem scope');
select col_default_is('audit', 'action', 'scope', 'tenant', 'scope padrão é tenant (mantém as ações já cadastradas)');
select throws_ok($$ insert into audit.action (action, kind, scope) values ('teste.qualquer', 'access', 'outro') $$, '23514', null, 'scope fora de tenant|network é recusado');

insert into audit.action (action, kind) values ('teste.da_clinica', 'access');
insert into audit.action (action, kind, scope) values ('teste.de_rede', 'access', 'network');

-- sem JWT (job) e sem p_tenant_id
select set_config('request.jwt.claims', '', true);
select throws_ok($$ select audit.record_event('teste.da_clinica', 'platform.tenant', null) $$, '22023', 'audit: ação de clínica sem tenant', 'ação de clínica sem tenant em nenhum dos dois é recusada');
select lives_ok($$ select audit.record_event('teste.da_clinica', 'platform.tenant', null, '{}', null, null, 'aaaaaaaa-0000-4000-8000-000000000001') $$, 'ação de clínica com p_tenant_id passa (job, paciente, profissional)');
select lives_ok($$ select audit.record_event('teste.de_rede', 'network.person', null) $$, 'ação de rede sem tenant passa');

-- com tenant no token, a ação de clínica passa sem p_tenant_id
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-4000-8000-0000000000a1","role":"authenticated","tenant_id":"aaaaaaaa-0000-4000-8000-000000000001","app_role":"ADMIN"}', true);
select lives_ok($$ select audit.record_event('teste.da_clinica', 'platform.tenant', null) $$, 'ação de clínica com tenant no token passa');

select * from finish();
rollback;
