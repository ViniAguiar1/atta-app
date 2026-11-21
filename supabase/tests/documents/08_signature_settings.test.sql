-- Configurações › Assinaturas & Validade (PDD v206 §10.4.2; ADR 0001 "Modelo de Assinatura da Clínica"). Só dado
-- fictício: nomes inventados, CNPJ e CPF de texto inventado.
begin;
select plan(26);

insert into platform.tenant (id, name, legal_name, cnpj) values
  ('00000000-0000-4000-8000-0000000008a1', 'Clínica Fictícia Assina', 'Clínica Fictícia Assina Ltda', '11222333000181'),
  ('00000000-0000-4000-8000-0000000008a2', 'Clínica Fictícia Sem RT', null, null);
-- clínica A: gestora e RT "mesma pessoa" com conselho (RT completo)
insert into platform.tenant_responsible (tenant_id, role, full_name, cpf_hmac, cpf_masked, cpf_enc, email_masked, email_enc,
  phone_masked, phone_enc, envelope_id, dek_wrapped, kek_version) values
  ('00000000-0000-4000-8000-0000000008a1', 'manager', 'Gestora Fictícia Assina', sha256('cpf-8a1'::bytea), '···.···.938-60',
   '\x01aa', 'g•••@exemplo.test', '\x01bb', '(11) •••••-0099', '\x01cc', gen_random_uuid(), '\x01dd', 1);
insert into platform.tenant_responsible (tenant_id, role, same_as_manager, council, council_uf, council_number, envelope_id,
  dek_wrapped, kek_version) values
  ('00000000-0000-4000-8000-0000000008a1', 'technical_lead', true, 'crm', 'SP', '880001', gen_random_uuid(), '\x01ee', 1);
insert into network.person (id, full_name, cpf_hmac, cpf_masked, cpf_enc, dek_wrapped, kek_version)
values ('00000000-0000-4000-8000-0000000008e1', 'Paciente Fictícia Assina', sha256('cpf-8e1'::bytea), '···.···.247-25',
        '\x01', '\x01', 1);
insert into network.person_tenant_link (tenant_id, person_id)
values ('00000000-0000-4000-8000-0000000008a1', '00000000-0000-4000-8000-0000000008e1');

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
create function pg_temp.sair() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
grant execute on function pg_temp.sair() to authenticated;
create function pg_temp.documento() returns text language sql security definer as $$
  insert into documents.document (tenant_id, person_id, folder_section)
  values ('00000000-0000-4000-8000-0000000008a1', '00000000-0000-4000-8000-0000000008e1', 'docs_clinicos')
  returning signature_model
$$;
grant execute on function pg_temp.documento() to authenticated;

-- ---------------------------------------------------------------- estrutura e grants
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'documents.signature_settings'::regclass),
          'signature_settings com RLS forçada');
select ok(not has_table_privilege('authenticated', 'documents.signature_settings', 'SELECT')
          and not has_table_privilege('authenticated', 'documents.signature_settings', 'UPDATE')
          and not has_table_privilege('anon', 'documents.signature_settings', 'SELECT')
          and not has_table_privilege('service_role', 'documents.signature_settings', 'SELECT'),
          'ninguém lê nem grava a tabela direto');
select ok(not has_function_privilege('anon', 'api.signature_settings_get()', 'EXECUTE')
          and not has_function_privilege('anon', 'api.signature_settings_set(text)', 'EXECUTE'),
          'anon sem EXECUTE nas duas funções');
select results_eq($$ select tenant_id, signature_model from documents.signature_settings
                     where tenant_id in ('00000000-0000-4000-8000-0000000008a1', '00000000-0000-4000-8000-0000000008a2')
                     order by tenant_id $$,
                  $$ values ('00000000-0000-4000-8000-0000000008a1'::uuid, 'rt_profissional'::text),
                            ('00000000-0000-4000-8000-0000000008a2'::uuid, 'rt_profissional'::text) $$,
                  'clínica nova nasce com a linha e o padrão do PDD: RT + Profissional');
select throws_ok($$ insert into documents.signature_settings (tenant_id, signature_model)
                    values ('00000000-0000-4000-8000-0000000008a2', 'rt_only')
                    on conflict (tenant_id) do update set signature_model = excluded.signature_model $$,
                 '23514', null, 'só os 3 valores do modelo (rt_only, do código antigo, é recusado)');

-- ---------------------------------------------------------------- leitura (ADMIN com aal2)
select pg_temp.entrar('00000000-0000-4000-8000-0000000008a1', 'ADMIN');
select is(api.signature_settings_get() ->> 'signature_model', 'rt_profissional', 'o modelo vigente');
select is(api.signature_settings_get() ->> 'trade_name', 'Clínica Fictícia Assina', 'a chancela: nome fantasia');
select is(api.signature_settings_get() ->> 'legal_name', 'Clínica Fictícia Assina Ltda', 'a chancela: razão social');
select is(api.signature_settings_get() ->> 'cnpj', '11222333000181', 'a chancela: CNPJ do cadastro');
select is(api.signature_settings_get() #>> '{technical_lead,full_name}', 'Gestora Fictícia Assina',
          'RT "mesma pessoa que o gestor": o nome do gestor');
select is(api.signature_settings_get() #>> '{technical_lead,council}', 'crm', 'o conselho do RT');
select is((api.signature_settings_get() ->> 'rt_complete')::boolean, true, 'RT completo pela regra do Perfil');
select is((api.signature_settings_get() -> 'technical_lead') ?| array['cpf_masked', 'cpf_hmac', 'email_masked'], false,
          'a chancela não leva CPF nem contato do RT');
select pg_temp.sair();
select ok((select count(*) from audit.event where action = 'signature.settings_read'
             and tenant_id = '00000000-0000-4000-8000-0000000008a1') >= 1, 'a leitura vai para a trilha (há nome de pessoa)');

select pg_temp.entrar('00000000-0000-4000-8000-0000000008a1', 'ADMIN', 'aal1');
select throws_ok($$ select api.signature_settings_get() $$, '42501', 'ATTA-AUTH-0004', 'ADMIN sem aal2 não lê');
select pg_temp.entrar('00000000-0000-4000-8000-0000000008a1', 'COLABORADOR');
select throws_ok($$ select api.signature_settings_get() $$, '42501', 'ATTA-AUTH-0004', 'Colaborador não lê');
select throws_ok($$ select api.signature_settings_set('rt_apenas') $$, '42501', 'ATTA-AUTH-0004', 'Colaborador não grava');

-- ---------------------------------------------------------------- escrita e o documento que guarda o modelo
select pg_temp.entrar('00000000-0000-4000-8000-0000000008a1', 'ADMIN');
select is(pg_temp.documento(), 'rt_profissional', 'o documento nasce com o modelo vigente');
select is(api.signature_settings_set('rt_apenas'), 'rt_apenas', 'grava o modelo');
select is(api.signature_settings_get() ->> 'signature_model', 'rt_apenas', 'e a leitura mostra o novo');
select throws_ok($$ select api.signature_settings_set('rt_only') $$, 'P0001', 'ATTA-IN-0001', 'valor fora da lista é recusado');
select is(pg_temp.documento(), 'rt_apenas', 'o próximo documento nasce com o modelo novo');
select pg_temp.sair();
select is((select count(*)::int from documents.document
           where tenant_id = '00000000-0000-4000-8000-0000000008a1' and signature_model = 'rt_profissional'), 1,
          'o documento antigo não muda');
select is((select before ->> 'signature_model' || '>' || (after ->> 'signature_model') from audit.event
           where action = 'signature.settings_update' and tenant_id = '00000000-0000-4000-8000-0000000008a1'),
          'rt_profissional>rt_apenas', 'a troca vai para a trilha com antes e depois');

-- ---------------------------------------------------------------- clínica sem RT: a escolha vale, a consolidação trava
select pg_temp.entrar('00000000-0000-4000-8000-0000000008a2', 'ADMIN');
select is((api.signature_settings_get() ->> 'rt_complete')::boolean, false, 'sem RT: rt_complete falso, para a tela avisar');
select is(api.signature_settings_set('rt_apenas'), 'rt_apenas',
          'mesmo sem RT, escolher "Apenas RT" é aceito (o PDD trava a consolidação, §10.4.1)');
select pg_temp.sair();

select * from finish();
rollback;
