-- MIG-42: gestor e Responsável Técnico do Perfil da Clínica. Só dado fictício: HMAC de texto inventado, máscaras de
-- CPF gerado, bytes cifrados de mentira (o banco não abre cifra; quem cifra é o servidor).
begin;
select plan(26);

insert into platform.tenant (id, name) values ('00000000-0000-4000-8000-0000000004f5', 'Clínica Fictícia Responsáveis');

create function pg_temp.entrar(p_tenant uuid, p_role text, p_aal text default null) returns uuid language plpgsql as $$
declare
  v_user uuid;
begin
  perform set_config('role', 'postgres', true);
  select m.user_id into v_user from platform.membership m
   where m.tenant_id = p_tenant and m.app_role = p_role and m.status = 'active' and m.deleted_at is null limit 1;
  if v_user is null then
    v_user := gen_random_uuid();
    insert into auth.users (id, email) values (v_user, v_user::text || '@teste.invalid');
    insert into platform.membership (tenant_id, user_id, app_role) values (p_tenant, v_user, p_role);
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated', 'tenant_id', p_tenant,
    'app_role', p_role, 'aal', coalesce(p_aal, case when p_role = 'ADMIN' then 'aal2' else 'aal1' end),
    'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)))::text, true);
  return v_user;
end $$;
grant execute on function pg_temp.entrar(uuid, text, text) to authenticated;

create function pg_temp.trilha() returns text language sql security definer as $$
  select string_agg(details::text, ';' order by seq) from audit.event
   where action = 'tenant.profile_update' and tenant_id = '00000000-0000-4000-8000-0000000004f5'
$$;
grant execute on function pg_temp.trilha() to authenticated;

select ok(not has_function_privilege('anon', 'api.clinic_responsible_set(text, text, text, bytea, text, bytea, boolean, uuid, bytea, smallint)', 'EXECUTE')
  and not has_function_privilege('anon', 'api.clinic_responsible_envelope(text)', 'EXECUTE'), 'anon não chama as funções do responsável');

select pg_temp.entrar('00000000-0000-4000-8000-0000000004f5', 'COLABORADOR');
select throws_ok($$ select api.clinic_responsible_set('manager', 'full_name', 'Gestora Fictícia') $$, '42501', 'ATTA-AUTH-0004',
  'COLABORADOR não grava o responsável');
select pg_temp.entrar('00000000-0000-4000-8000-0000000004f5', 'ADMIN', 'aal1');
select throws_ok($$ select * from api.clinic_responsible_envelope('manager') $$, '42501', 'ATTA-AUTH-0004',
  'ADMIN sem o 2º fator não lê o envelope');

select pg_temp.entrar('00000000-0000-4000-8000-0000000004f5', 'ADMIN');
select is((select count(*)::int from api.clinic_responsible_envelope('manager')), 0, 'sem linha, sem envelope');
select is(api.clinic_profile() -> 'lock_on_first_fill', '["legal_name", "cnpj"]'::jsonb, 'a leitura diz quais campos travam no 1º preenchimento');

-- ---------------------------------------------------------------- primeira escrita: com envelope
select throws_ok($$ select api.clinic_responsible_set('manager', 'full_name', 'Gestora Fictícia') $$, 'P0001', 'ATTA-IN-0001',
  'a primeira escrita do papel exige o envelope');
select lives_ok($$ select api.clinic_responsible_set('manager', 'full_name', 'Gestora Fictícia',
  p_envelope_id => '00000000-0000-4000-8000-0000000004e9', p_dek_wrapped => '\x01aa', p_kek_version => 1::smallint) $$,
  'primeira escrita com o envelope cria a linha');
select is((select envelope_id::text from api.clinic_responsible_envelope('manager')), '00000000-0000-4000-8000-0000000004e9',
  'o envelope volta para o servidor cifrar os próximos campos');
select throws_ok($$ select api.clinic_responsible_set('manager', 'email', p_masked => 'g•••@exemplo.test', p_enc => '\x01bb',
  p_envelope_id => gen_random_uuid(), p_dek_wrapped => '\x01cc', p_kek_version => 1::smallint) $$, 'P0001', 'ATTA-IN-0003',
  'outro envelope na mesma linha é recusado');

-- ---------------------------------------------------------------- campos do gestor
select isnt(api.clinic_responsible_set('manager', 'cpf', p_hmac => sha256('cpf-ficticio'::bytea), p_masked => '···.···.938-60',
  p_enc => '\x01dd'), null, 'CPF do gestor gravado (HMAC, máscara e cifrado) e saved_at devolvido');
select throws_ok($$ select api.clinic_responsible_set('manager', 'cpf', p_hmac => sha256('x'::bytea), p_masked => '938-60', p_enc => '\x01') $$,
  'P0001', 'ATTA-IN-0001', 'máscara de CPF fora do formato');
select throws_ok($$ select api.clinic_responsible_set('manager', 'cpf', p_masked => '···.···.938-60') $$,
  'P0001', 'ATTA-IN-0001', 'CPF sem o HMAC e o cifrado é recusado');
select lives_ok($$ select api.clinic_responsible_set('manager', 'email', p_masked => 'g•••@exemplo.test', p_enc => '\x01ee') $$,
  'e-mail do gestor gravado');
select lives_ok($$ select api.clinic_responsible_set('manager', 'whatsapp', p_masked => '(11) •••••-0099', p_enc => '\x01ff') $$,
  'WhatsApp do gestor gravado');
select throws_ok($$ select api.clinic_responsible_set('manager', 'council', 'crm') $$, 'P0001', 'ATTA-IN-0001',
  'gestor não tem conselho');
select is(api.clinic_profile() #>> '{manager,cpf_masked}', '···.···.938-60', 'a leitura mostra só a máscara do CPF');

-- ---------------------------------------------------------------- Responsável Técnico
select lives_ok($$ select api.clinic_responsible_set('technical_lead', 'council', 'CRM',
  p_envelope_id => '00000000-0000-4000-8000-0000000004ea', p_dek_wrapped => '\x02aa', p_kek_version => 1::smallint) $$,
  'primeira escrita do RT (conselho) com o envelope dele');
select throws_ok($$ select api.clinic_responsible_set('technical_lead', 'council', 'oab') $$, 'P0001', 'ATTA-IN-0001',
  'conselho fora da lista do RT (§10.4.1)');
select throws_ok($$ select api.clinic_responsible_set('technical_lead', 'email', p_masked => 'r@exemplo.test', p_enc => '\x01') $$,
  'P0001', 'ATTA-IN-0001', 'RT não tem e-mail nesta tela');
select lives_ok($$ select api.clinic_responsible_set('technical_lead', 'council_uf', 'sp') $$, 'UF do conselho');
select lives_ok($$ select api.clinic_responsible_set('technical_lead', 'council_number', '999906') $$, 'número do registro');
select lives_ok($$ select api.clinic_responsible_set('technical_lead', 'same_as_manager', p_bool => true) $$, 'RT é a mesma pessoa');
select throws_ok($$ select api.clinic_responsible_set('technical_lead', 'full_name', 'Outro Nome') $$, 'P0001', 'ATTA-IN-0003',
  'com "mesma pessoa", o RT não ganha nome próprio');
select is(api.clinic_profile() #>> '{technical_lead,full_name}', 'Gestora Fictícia', 'o RT "mesma pessoa" mostra o nome do gestor');
select ok(not (api.clinic_profile() -> 'missing_required' ?| array['manager.cpf', 'manager.email', 'technical_lead.council_uf']),
  'gestor e RT completos saem do que falta');

-- ---------------------------------------------------------------- trilha só com o nome do campo
select ok(pg_temp.trilha() like '%"field": "manager.cpf"%' and pg_temp.trilha() not like '%938-60%',
  'a trilha leva papel e campo, nunca o valor');

select * from finish();
rollback;
