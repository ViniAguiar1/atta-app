-- MIG-12: colunas da tela de Pacientes (MIG-43), iguais na lista e na busca. Dados fictícios.
begin;
select plan(9);

insert into platform.tenant (id, name) values ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A');

create function pg_temp.entrar(p_tenant uuid, p_role text) returns void language plpgsql as $$
declare
  v_user uuid := gen_random_uuid();
begin
  -- usuário fictício com vínculo ativo na clínica: o has_permission do MIG-02 confere o vínculo no banco
  perform set_config('role', 'postgres', true);
  insert into auth.users (id, email) values (v_user, v_user::text || '@teste.invalid');
  if p_tenant is not null and p_role in ('ADMIN', 'COLABORADOR') then
    insert into platform.membership (tenant_id, user_id, app_role) values (p_tenant, v_user, p_role);
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'tenant_id', p_tenant, 'app_role', p_role,
                      -- ADMIN só com o 2º fator no token (MIG-03)
                      'aal', case when p_role = 'ADMIN' then 'aal2' else 'aal1' end,
                      -- hora do login (sessão de 12 h, MIG-03 do Backend 1)
                      'amr', json_build_array(json_build_object('method', 'password',
                                                                'timestamp', extract(epoch from now())::bigint)))::text, true);
end $$;

create function pg_temp.cadastrar(p_id uuid, p_nome text, p_social text, p_cpf text, p_incompleto boolean)
returns boolean language sql as $$
  select reused from api.patient_register(p_id, p_nome, p_social, date '1990-05-10',
    case when p_incompleto then null else sha256(p_cpf::bytea) end,
    case when p_incompleto then null else '···.···.' || right(p_cpf, 6) end,
    case when p_incompleto then null else '\x01aa'::bytea end,
    p_phone_enc => '\x01bb', p_dek_wrapped => '\x01cc', p_kek_version => 1::smallint,
    p_is_incomplete => p_incompleto)
$$;

do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated', pg_my_temp_schema()::regnamespace);
end $$;

select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select pg_temp.cadastrar('00000000-0000-4000-8000-0000000000e1', 'Marina Teste Fictícia', 'Mari Fictícia', '529.982.247-25', false);
select pg_temp.cadastrar('00000000-0000-4000-8000-0000000000e2', 'Bebê Fictício', null, '', true);

select results_eq($$ select display_name, display_is_social, birth_date, is_incomplete from api.patient_list() order by display_name $$,
                  $$ values ('Bebê Fictício'::text, false, date '1990-05-10', true),
                            ('Mari Fictícia', true, date '1990-05-10', false) $$,
                  'a lista traz o nome de exibição (social quando houver), se é o social, nascimento e incompleto');
select ok((select bool_and(total_active = 2) from api.patient_list()), 'a lista traz o total de ativos da clínica');
select ok((select bool_and(last_appointment is null and documents = '[]'::jsonb) from api.patient_list()),
          'último atendimento e documentos já estão no contrato (nulo e [] até a agenda e o schema documents)');
select ok((select phone_enc = '\x01bb' and envelope_id = person_id and network_access = 'owner'
           from api.patient_list() where display_name = 'Mari Fictícia'), 'contato com o envelope_id para o AAD');
select results_eq($$ select display_name, display_is_social, birth_date, phone_enc is not null, total_active
                     from api.patient_search(p_name => 'Marina') $$,
                  $$ values ('Mari Fictícia'::text, true, date '1990-05-10', true, 2) $$,
                  'a busca por nome devolve as mesmas colunas da lista, com contato e nascimento');
select is((select count(*)::int from api.patient_search(p_name => 'Mari Fic')), 1, 'a busca acha pelo nome social');
select is((select display_name from api.patient_search(p_doc_hmac => sha256('529.982.247-25'::bytea))), 'Mari Fictícia',
          'a busca por CPF (HMAC) devolve a mesma linha');
select is((select count(*)::int from api.patient_search(p_name => 'Ninguém')), 0, 'nome que não existe: nada');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'COLABORADOR');
select is((select count(*)::int from api.patient_list()), 2, 'o Colaborador também lista (Pacientes é dele)');

select * from finish();
rollback;
