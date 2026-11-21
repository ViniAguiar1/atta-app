-- MIG-42: Perfil da Clínica (PDD §10.4.1; ADR 0001 §"Perfil da Clínica"). Só dado fictício: CNPJ gerado, nomes
-- inventados, bytes cifrados de mentira (o banco não abre cifra).
begin;
select plan(47);

insert into platform.tenant (id, name) values
  ('00000000-0000-4000-8000-0000000004f1', 'Clínica Fictícia Perfil'),
  ('00000000-0000-4000-8000-0000000004f2', 'Clínica Fictícia Vizinha');

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

create function pg_temp.trilha(p_action text) returns text language sql security definer as $$
  select string_agg(details::text, ';' order by seq) from audit.event
   where action = p_action and tenant_id = '00000000-0000-4000-8000-0000000004f1'
$$;
grant execute on function pg_temp.trilha(text) to authenticated;

-- ---------------------------------------------------------------- estrutura e grants
select has_column('platform', 'tenant', 'commercial_email', 'colunas da empresa em platform.tenant');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'platform.tenant_responsible'::regclass),
  'tenant_responsible com RLS forçada');
select ok(not has_table_privilege('authenticated', 'platform.tenant_responsible', 'SELECT')
  and not has_table_privilege('anon', 'platform.tenant_responsible', 'SELECT'), 'responsáveis sem grant (só por função)');
select ok(not has_table_privilege('authenticated', 'platform.tenant', 'UPDATE')
  and not has_column_privilege('authenticated', 'platform.tenant', 'name', 'UPDATE'), 'sem update direto em platform.tenant (só por função)');
select ok(not has_function_privilege('authenticated', 'private.cnpj_is_valid(text)', 'EXECUTE') and not has_function_privilege('anon', 'api.clinic_profile()', 'EXECUTE')
  and not has_function_privilege('anon', 'api.clinic_profile_set(text, text)', 'EXECUTE'), 'anon não chama o Perfil');

-- ---------------------------------------------------------------- CNPJ pelo dígito, nos dois formatos
select ok(private.cnpj_is_valid('41827365000171'), 'CNPJ numérico gerado é válido');
select ok(private.cnpj_is_valid('12ABC34501DE35'), 'CNPJ alfanumérico (exemplo da Receita) é válido');
select ok(not private.cnpj_is_valid('41827365000172'), 'DV errado é recusado');
select ok(not private.cnpj_is_valid('11111111111111'), 'todas as posições iguais são recusadas');
select ok(not private.cnpj_is_valid('12abc34501de35'), 'letra minúscula fica fora da forma guardada');
select ok(private.cnpj_is_valid('AB12CD34000184') and private.cnpj_is_valid('9XYZ8765000122'), 'outros alfanuméricos gerados são válidos');
select throws_ok($$ update platform.tenant set cnpj = '41827365000172' where id = '00000000-0000-4000-8000-0000000004f2' $$,
  '23514', null, 'o gatilho da coluna recusa CNPJ com DV errado (qualquer caminho de escrita)');

-- ---------------------------------------------------------------- quem lê e quem grava
select pg_temp.entrar('00000000-0000-4000-8000-0000000004f1', 'COLABORADOR');
select throws_ok($$ select api.clinic_profile() $$, '42501', 'ATTA-AUTH-0004', 'COLABORADOR não lê o Perfil');
select throws_ok($$ select api.clinic_profile_set('main_specialty', 'Dermatologia') $$, '42501', 'ATTA-AUTH-0004',
  'COLABORADOR não grava o Perfil');
select pg_temp.entrar('00000000-0000-4000-8000-0000000004f1', 'ADMIN', 'aal1');
select throws_ok($$ select api.clinic_profile() $$, '42501', 'ATTA-AUTH-0004', 'ADMIN sem o 2º fator não lê');

select pg_temp.entrar('00000000-0000-4000-8000-0000000004f1', 'ADMIN');
select is(api.clinic_profile() -> 'fields' ->> 'trade_name', 'Clínica Fictícia Perfil', 'ADMIN lê o nome fantasia');
select ok(api.clinic_profile() -> 'missing_required' ?& array['legal_name', 'cnpj', 'manager.cpf', 'technical_lead.council',
  'clinic_whatsapp'], 'perfil vazio: o banco lista o que falta');
select is(api.clinic_profile() -> 'protected_fields', '[]'::jsonb, 'nada protegido antes do 1º preenchimento');
select is(api.clinic_profile() ->> 'timezone', 'America/Sao_Paulo', 'leva o fuso para o "salvo às"');

-- ---------------------------------------------------------------- escrita campo a campo
select isnt(api.clinic_profile_set('trade_name', 'Clínica Fictícia Perfil Renovada'), null, 'grava o nome fantasia e devolve saved_at');
select is((api.clinic_profile() ->> 'saved_at') is not null, true, 'o "salvo às" aparece na leitura');
select throws_ok($$ select api.clinic_profile_set('trade_name', '  ') $$, 'P0001', 'ATTA-IN-0001', 'nome fantasia não fica vazio');
select throws_ok($$ select api.clinic_profile_set('cor_do_logo', 'azul') $$, 'P0001', 'ATTA-IN-0001', 'campo fora da lista é recusado');
select throws_ok($$ select api.clinic_profile_set('cnpj', '41827365000172') $$, 'P0001', 'ATTA-IN-0001', 'CNPJ com DV errado é recusado');
select throws_ok($$ select api.clinic_profile_set('address_cep', '1234-567') $$, 'P0001', 'ATTA-IN-0001', 'CEP fora do formato');
select throws_ok($$ select api.clinic_profile_set('address_uf', 'XX') $$, 'P0001', 'ATTA-IN-0001', 'UF inexistente');
select throws_ok($$ select api.clinic_profile_set('clinic_whatsapp', '1133334444') $$, 'P0001', 'ATTA-IN-0001',
  'WhatsApp precisa ser celular com DDD');
select throws_ok($$ select api.clinic_profile_set('commercial_email', 'Contato@Clinica.Test') $$, 'P0001', 'ATTA-IN-0001',
  'e-mail chega em minúsculas');
select lives_ok($$ select api.clinic_profile_set('clinic_whatsapp', '11990010099') $$, 'WhatsApp celular gravado');
select lives_ok($$ select api.clinic_profile_set('phone', null) $$, 'campo opcional pode ficar vazio');
select lives_ok($$ select api.clinic_profile_set('timezone', 'America/Manaus') $$, 'fuso gravado pela função');
select throws_ok($$ select api.clinic_profile_set('timezone', 'Lua/Base') $$, 'P0001', 'ATTA-IN-0001', 'fuso inexistente');
select throws_ok($$ select api.clinic_profile_set('cnpj', '12ABC34501DE*35') $$, 'P0001', 'ATTA-IN-0001',
  'só ponto, barra, hífen e espaço saem na normalização; outro caractere cai na validação');

-- ---------------------------------------------------------------- CNPJ e razão social: só o 1º preenchimento
select lives_ok($$ select api.clinic_profile_set('cnpj', '12.abc.345/01de-35') $$, '1º CNPJ (alfanumérico, com máscara) é livre');
select is(api.clinic_profile() -> 'fields' ->> 'cnpj', '12ABC34501DE35', 'letras do CNPJ guardadas em maiúsculas');
select throws_ok($$ select api.clinic_profile_set('cnpj', '41827365000171') $$, 'P0001', 'ATTA-IN-0003',
  'trocar o CNPJ preenchido é ação protegida');
select lives_ok($$ select api.clinic_profile_set('legal_name', 'Perfil Fictício Serviços Ltda.') $$, '1ª razão social é livre');
select throws_ok($$ select api.clinic_profile_set('legal_name', 'Outra Razão Ltda.') $$, 'P0001', 'ATTA-IN-0003',
  'trocar a razão social preenchida é ação protegida');
select throws_ok($$ select api.clinic_profile_set('legal_name', null) $$, 'P0001', 'ATTA-IN-0003',
  'apagar a razão social também é protegido');
select is(api.clinic_profile() -> 'protected_fields', '["legal_name", "cnpj"]'::jsonb, 'a leitura avisa os campos travados');
-- a clínica vizinha, ainda sem CNPJ, tenta usar o CNPJ que a primeira já tem
select pg_temp.entrar('00000000-0000-4000-8000-0000000004f2', 'ADMIN');
select throws_ok($$ select api.clinic_profile_set('cnpj', '12ABC34501DE35') $$, 'P0001', 'ATTA-IN-0003',
  'CNPJ já usado por outra clínica é recusado (cnpj_in_use)');
select pg_temp.entrar('00000000-0000-4000-8000-0000000004f1', 'ADMIN');

-- ---------------------------------------------------------------- trilha: só o nome do campo
select ok(pg_temp.trilha('tenant.profile_update') like '%"field": "cnpj"%', 'a escrita vai para a trilha com o nome do campo');
select ok(pg_temp.trilha('tenant.profile_update') not like '%12ABC34501DE35%'
  and pg_temp.trilha('tenant.profile_update') not like '%11990010099%', 'a trilha nunca leva o valor');

-- ---------------------------------------------------------------- responsáveis mascarados (a escrita vem no PR seguinte)
select set_config('role', 'postgres', true);
insert into platform.tenant_responsible (tenant_id, role, full_name, cpf_hmac, cpf_masked, cpf_enc, email_masked, email_enc,
  phone_masked, phone_enc, envelope_id, dek_wrapped, kek_version) values
  ('00000000-0000-4000-8000-0000000004f1', 'manager', 'Gestora Fictícia', sha256('cpf-ficticio'::bytea), '···.···.938-60', '\x01aa',
   'g•••@exemplo.test', '\x01bb', '(11) •••••-0099', '\x01cc', gen_random_uuid(), '\x01dd', 1);
insert into platform.tenant_responsible (tenant_id, role, same_as_manager, council, council_uf, council_number, envelope_id,
  dek_wrapped, kek_version) values
  ('00000000-0000-4000-8000-0000000004f1', 'technical_lead', true, 'crm', 'SP', '999905', gen_random_uuid(), '\x01ee', 1);
select throws_ok($$ insert into platform.tenant_responsible (tenant_id, role, council, envelope_id, dek_wrapped, kek_version)
  values ('00000000-0000-4000-8000-0000000004f2', 'manager', 'crm', gen_random_uuid(), '\x01', 1) $$, '23514', null,
  'gestor não tem conselho');
select pg_temp.entrar('00000000-0000-4000-8000-0000000004f1', 'ADMIN');
select is(api.clinic_profile() #>> '{technical_lead,full_name}', 'Gestora Fictícia', 'RT "mesma pessoa" mostra o nome do gestor');
select is(api.clinic_profile() #>> '{manager,cpf_masked}', '···.···.938-60', 'CPF do gestor só mascarado');
select ok(not (api.clinic_profile() -> 'missing_required' ?| array['manager.cpf', 'technical_lead.cpf', 'technical_lead.council']),
  'com gestor e RT completos, eles saem do que falta');

select * from finish();
rollback;
