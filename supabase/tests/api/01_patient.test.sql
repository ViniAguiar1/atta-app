-- MIG-12 (b): as funções api.patient_* (dados fictícios: hmacs de texto inventado, nomes inventados).
begin;
select plan(45);

insert into platform.tenant (id, name) values
  ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A'),
  ('00000000-0000-4000-8000-00000000000b', 'Clínica Fictícia B');

create function pg_temp.entrar(p_tenant uuid, p_role text) returns void language plpgsql as $$
declare
  v_user uuid := gen_random_uuid();
begin
  -- usuário fictício com vínculo ativo na clínica: o has_permission do MIG-02 confere o vínculo no banco
  perform set_config('role', 'postgres', true);
  insert into auth.users (id, email) values (v_user, v_user::text || '@teste.invalid');
  if p_tenant is not null and p_role in ('ADMIN', 'COLABORADOR') then
    -- no máximo 2 ADMIN vivos por clínica (MIG-06, PDD §10.4.3): com 2, entra como um deles
    if p_role = 'ADMIN' and (select count(*) from platform.membership m where m.tenant_id = p_tenant
        and m.app_role = 'ADMIN' and m.deleted_at is null and m.status <> 'rejected') >= 2 then
      select m.user_id into v_user from platform.membership m where m.tenant_id = p_tenant and m.app_role = 'ADMIN'
         and m.status = 'active' and m.deleted_at is null order by m.created_at limit 1;
    else
      insert into platform.membership (tenant_id, user_id, app_role) values (p_tenant, v_user, p_role);
    end if;
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'tenant_id', p_tenant, 'app_role', p_role,
                      -- ADMIN só com o 2º fator no token (MIG-03)
                      'aal', case when p_role = 'ADMIN' then 'aal2' else 'aal1' end,
                      -- hora do login (MIG-03: sessão de no máximo 12 h, has_permission confere)
                      'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)))::text, true);
end $$;

create function pg_temp.remover_vinculo() returns void language plpgsql as $$
begin
  -- o vínculo sai do banco, mas o token continua válido (regra da ADR 0001 §2, revisão do MIG-02)
  perform set_config('role', 'postgres', true);
  update platform.membership set deleted_at = now()
  where user_id = (current_setting('request.jwt.claims')::jsonb ->> 'sub')::uuid;
  perform set_config('role', 'authenticated', true);
end $$;

create function pg_temp.cadastrar(p_id uuid, p_nome text, p_cpf text) returns boolean language sql as $$
  select reused from api.patient_register(p_id, p_nome, null, date '1990-05-10', sha256(p_cpf::bytea),
    '***.***.***-' || right(p_cpf, 2), '\x01aa', p_phone_enc => '\x01bb', p_dek_wrapped => '\x01cc',
    p_kek_version => 1::smallint)
$$;

create function pg_temp.trilha_update() returns text language sql security definer as $$
  select before::text || '|' || after::text from audit.event where action = 'patient.update'
$$;
create function pg_temp.detalhe_update() returns text language sql security definer as $$
  select details::text from audit.event where action = 'patient.update'
$$;

create function pg_temp.nome_na_rede(p_id uuid) returns text language sql security definer as $$
  select full_name from network.person where id = p_id
$$;
create function pg_temp.antes_local() returns text language sql security definer as $$
  select before::text from audit.event where action = 'patient.update' and details ->> 'scope' = 'local'
$$;

create function pg_temp.eventos(p_action text) returns int language sql security definer as $$
  select count(*)::int from audit.event where action = p_action
$$;

do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated',
                 pg_my_temp_schema()::regnamespace);
end $$;

-- estrutura: todas SECURITY DEFINER com search_path vazio, e anon fora
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'api' and p.proname like 'patient%' and p.prosecdef
             and p.proconfig @> array['search_path=""']), 7, 'as 7 funções patient_* são SECURITY DEFINER com search_path vazio');
select ok(not has_function_privilege('anon', 'api.patient_get(uuid)', 'EXECUTE'), 'anon não lê paciente');
select ok(not has_function_privilege('anon', 'api.patient_search(text, bytea)', 'EXECUTE'), 'anon não busca paciente');

-- cadastro na clínica A
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'COLABORADOR');
select is(pg_temp.cadastrar('00000000-0000-4000-8000-0000000000e1', 'Marina Teste Fictícia', 'cpf-ficticio-11'), false,
          'CPF novo cria a pessoa');
select is(pg_temp.cadastrar('00000000-0000-4000-8000-0000000000e2', 'João Simulado', 'cpf-ficticio-22'), false,
          'segundo paciente da A');
select throws_ok($$ select pg_temp.cadastrar(gen_random_uuid(), 'Marina Outra', 'cpf-ficticio-11') $$,
                 '23505', 'ATTA-IN-0002', 'o mesmo CPF não se cadastra duas vezes na mesma clínica (RN-PAC-01)');
select throws_ok($$ select * from api.patient_register(gen_random_uuid(), 'Bebê Fictício', p_birth_date => current_date + 1,
                    p_is_incomplete => true) $$, 'P0001', 'ATTA-IN-0001', 'nascimento no futuro é recusado');
select is(pg_temp.eventos('patient.register'), 2, 'cada cadastro deixa um evento em audit');

-- busca na A
select is((select display_name from api.patient_search(p_doc_hmac => sha256('cpf-ficticio-11'::bytea))),
          'Marina Teste Fictícia', 'busca por CPF (HMAC) acha o paciente da clínica');
select is((select cpf_masked from api.patient_search(p_doc_hmac => sha256('cpf-ficticio-11'::bytea))),
          '***.***.***-11', 'a busca devolve o CPF mascarado');
select is((select count(*)::int from api.patient_search(p_name => 'simul')), 1, 'busca por parte do nome');
select is((select count(*)::int from api.patient_search(p_name => '%%')), 0, 'o % do usuário não vira curinga');
select throws_ok($$ select * from api.patient_search(p_name => 'Ma', p_doc_hmac => sha256('x'::bytea)) $$,
                 'P0001', 'ATTA-IN-0001', 'nome e CPF juntos são recusados');
select throws_ok($$ select * from api.patient_search(p_doc_hmac => '\x0102') $$, 'P0001', 'ATTA-IN-0001',
                 'HMAC que não tem 32 bytes é recusado');
select ok(pg_temp.eventos('patient.search') >= 3, 'as buscas deixam evento em audit');

-- clínica B: não acha o paciente da A, nem por nome nem por CPF (sem oráculo de quem está na rede)
select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'ADMIN');
select is((select count(*)::int from api.patient_search(p_name => 'Marina')), 0, 'B não acha por nome o paciente da A');
select is((select count(*)::int from api.patient_search(p_doc_hmac => sha256('cpf-ficticio-11'::bytea))), 0,
          'B não fica sabendo que o CPF já está na rede (decisão do dono)');
select throws_ok($$ select * from api.patient_get('00000000-0000-4000-8000-0000000000e1') $$, 'P0002', 'ATTA-CORE-0005',
                 'B não lê o paciente da A');
select throws_ok($$ select api.patient_update('00000000-0000-4000-8000-0000000000e1', 'motivo qualquer', 'Hacker') $$,
                 'P0002', 'ATTA-CORE-0005', 'B não altera o paciente da A');

-- B cadastra a mesma pessoa: reaproveita, sem mostrar nem sobrescrever o dado de rede
select is(pg_temp.cadastrar(gen_random_uuid(), 'Nome Digitado Pela B', 'cpf-ficticio-11'), true,
          'CPF já na rede é reaproveitado (RN-PAC-09)');
-- acesso pendente (dono, 20/11; ADR 0001 §1): a B vê só o que digitou, o CPF mascarado e o selo, sem contato
select is((select full_name from api.patient_get('00000000-0000-4000-8000-0000000000e1')), 'Nome Digitado Pela B',
          'pendente: a B lê o nome que ela digitou, não o da rede');
select ok((select phone_enc is null and email_enc is null and dek_wrapped is null and kek_version is null
           from api.patient_get('00000000-0000-4000-8000-0000000000e1')), 'pendente: sem contato nem envelope da rede');
select is((select network_access from api.patient_get('00000000-0000-4000-8000-0000000000e1')), 'pending',
          'pendente: a tela sabe que o acesso à rede ainda não foi autorizado');
select is((select count(*)::int from api.patient_search(p_name => 'Marina')), 0,
          'pendente: a busca da B pelo nome da rede não acha nada');
select is((select count(*)::int from api.patient_search(p_name => 'Digitado Pela B')), 1,
          'pendente: a busca da B pelo nome que ela digitou acha');

-- A atualiza, sempre com motivo
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'COLABORADOR');
select throws_ok($$ select api.patient_update('00000000-0000-4000-8000-0000000000e2', '', 'João S. Atualizado') $$,
                 'P0001', 'ATTA-IN-0001', 'atualização sem motivo é recusada');
select lives_ok($$ select api.patient_update('00000000-0000-4000-8000-0000000000e2', 'paciente pediu a correção',
                   p_social_name => 'Jo Simulado') $$, 'atualização com motivo');
select is((select display_name from api.patient_search(p_name => 'Jo Simulado')), 'Jo Simulado',
          'o nome social vira o nome de exibição');
select is(pg_temp.eventos('patient.update'), 1, 'a atualização deixa evento em audit');
select is(pg_temp.trilha_update(), '{"social_name": null}|{"social_name": "Jo Simulado"}',
          'a trilha guarda antes e depois só do campo que mudou (ADR 0003)');
select is(pg_temp.detalhe_update(), '{"reason": "paciente pediu a correção"}',
          'o detalhe leva o motivo, sem nome nem contato');

-- lista paginada
select is((select count(*)::int from api.patient_list(p_limit => 1)), 1, 'primeira página com 1');
select is((select count(*)::int from api.patient_list(p_after_name => 'Jo Simulado',
           p_after_id => '00000000-0000-4000-8000-0000000000e2', p_limit => 10)), 1, 'a página seguinte traz o resto');

-- B edita só o que é dela: o dado de rede e o contato não se tocam
select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'ADMIN');
select ok((select phone_enc is null and dek_wrapped is null from api.patient_list()
           where person_id = '00000000-0000-4000-8000-0000000000e1'), 'pendente: a lista da B não traz contato da rede');
select throws_ok($$ select api.patient_update('00000000-0000-4000-8000-0000000000e1', 'paciente informou',
                    p_phone_enc => '\x01ff') $$, 'P0001', 'ATTA-IN-0001', 'pendente: a B não grava contato');
select lives_ok($$ select api.patient_update('00000000-0000-4000-8000-0000000000e1', 'paciente informou',
                   'Nome Corrigido Pela B') $$, 'pendente: a B corrige o nome dela');
select is(pg_temp.nome_na_rede('00000000-0000-4000-8000-0000000000e1'), 'Marina Teste Fictícia',
          'pendente: o update da B não muda network.person');
select is(pg_temp.antes_local(), '{"local_full_name": "Nome Digitado Pela B"}',
          'pendente: o antes da auditoria da B não leva o valor de rede');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'COLABORADOR');
select is((select full_name from api.patient_get('00000000-0000-4000-8000-0000000000e1')), 'Marina Teste Fictícia',
          'a A, dona do cadastro, continua lendo o dado de rede');

-- divergência e falha fechada
select ok((select api.report_divergence('00000000-0000-4000-8000-0000000000e1', 'nome_nao_confere') is not null),
          'divergência reportada com motivo da lista (RN-PAC-08)');
select throws_ok($$ select api.report_divergence('00000000-0000-4000-8000-0000000000e1', 'nome no WhatsApp diferente') $$,
                 'P0001', 'ATTA-IN-0001', 'divergência com texto livre é recusada (dono, 20/11)');
select pg_temp.entrar(null, 'ADMIN');
select throws_ok($$ select * from api.patient_list() $$, '42501', 'ATTA-AUTH-0004', 'sem clínica no token, nada');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'OUTRO');
select throws_ok($$ select * from api.patient_search(p_name => 'Marina') $$, '42501', 'ATTA-AUTH-0004',
                 'papel desconhecido não busca');

-- vínculo removido com o token ainda válido: nada (ADR 0001 §2)
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select pg_temp.remover_vinculo();
select throws_ok($$ select * from api.patient_list() $$, '42501', 'ATTA-AUTH-0004',
                 'vínculo removido: o ADMIN com token válido não lista pacientes');
select throws_ok($$ select * from api.patient_get('00000000-0000-4000-8000-0000000000e1') $$, '42501', 'ATTA-AUTH-0004',
                 'vínculo removido: o ADMIN com token válido não abre o paciente');

select * from finish();
rollback;
