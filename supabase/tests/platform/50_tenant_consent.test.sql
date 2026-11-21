-- MIG-48: Políticas de Consentimento da clínica (PDD §10.6.3): 2 toggles desligados por padrão, só o gestor, trilha.
begin;
select plan(12);

insert into platform.tenant (id, name) values
  ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A'),
  ('00000000-0000-4000-8000-00000000000b', 'Clínica Fictícia B');

create function pg_temp.entrar(p_tenant uuid, p_role text) returns void language plpgsql as $$
declare
  v_user uuid;
begin
  perform set_config('role', 'postgres', true);
  if p_role = 'ADMIN' then   -- no máximo 2 ADMIN vivos (MIG-06)
    select m.user_id into v_user from platform.membership m
    where m.tenant_id = p_tenant and m.app_role = 'ADMIN' and m.status = 'active' and m.deleted_at is null limit 1;
  end if;
  if v_user is null then
    v_user := gen_random_uuid();
    insert into auth.users (id, email) values (v_user, v_user::text || '@teste.invalid');
    if p_tenant is not null then
      insert into platform.membership (tenant_id, user_id, app_role) values (p_tenant, v_user, p_role);
    end if;
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'tenant_id', p_tenant, 'app_role', p_role,
                      'aal', case when p_role = 'ADMIN' then 'aal2' else 'aal1' end,
                      'amr', json_build_array(json_build_object('method', 'password',
                                                                'timestamp', extract(epoch from now())::bigint)))::text, true);
end $$;
create function pg_temp.trilha(p_tenant uuid) returns table (key text, antes boolean, depois boolean)
language sql security definer as $$
  select details ->> 'key', (before ->> 'granted')::boolean, (after ->> 'granted')::boolean
  from audit.event where action = 'tenant.consent_update' and tenant_id = p_tenant order by seq
$$;

do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated', pg_my_temp_schema()::regnamespace);
end $$;

select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select is(api.tenant_consents_get(),
          '{"divulgacao_cliente": {"granted": false, "updated_at": null}, "comunicacoes_novidades": {"granted": false, "updated_at": null}}'::jsonb,
          'clínica nova: os dois desativados por padrão (§10.6.3)');
select is(api.tenant_consent_set('divulgacao_cliente', true) ->> 'granted', 'true', 'o gestor ativa a Divulgação como cliente');
select ok((select (r -> 'divulgacao_cliente' ->> 'granted')::boolean and r -> 'divulgacao_cliente' ->> 'updated_at' is not null
                  and not (r -> 'comunicacoes_novidades' ->> 'granted')::boolean
           from (select api.tenant_consents_get() r) x), 'a leitura mostra o ativado, com a data, e o outro continua desativado');
select api.tenant_consent_set('divulgacao_cliente', true);
select api.tenant_consent_set('divulgacao_cliente', false);
select results_eq($$ select key, antes, depois from pg_temp.trilha('00000000-0000-4000-8000-00000000000a') $$,
                  $$ values ('divulgacao_cliente'::text, false, true), ('divulgacao_cliente', true, false) $$,
                  'ativação e desativação na trilha, com antes e depois; repetir o mesmo valor não registra de novo');
select ok(not (api.tenant_consents_get() -> 'divulgacao_cliente' ->> 'granted')::boolean, 'desativar vale na hora');
select throws_ok($$ select api.tenant_consent_set('uso_anonimo_dados', true) $$, 'P0001', 'ATTA-IN-0001',
                 'não existe toggle de uso anônimo de dados nem de IA (§10.6.3)');
select throws_ok($$ select api.tenant_consent_set('comunicacoes_novidades', null) $$, 'P0001', 'ATTA-IN-0001',
                 'valor nulo: recusado');
select throws_ok($$ select * from platform.tenant_consent $$, '42501', null, 'a tabela não é lida direto');

-- isolamento, Colaborador e sem clínica
select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'ADMIN');
select ok(not (api.tenant_consents_get() -> 'divulgacao_cliente' ->> 'granted')::boolean
          and not exists (select 1 from pg_temp.trilha('00000000-0000-4000-8000-00000000000b')),
          'a clínica B não vê nem herda o consentimento da A');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'COLABORADOR');
select throws_ok($$ select api.tenant_consents_get() $$, '42501', 'ATTA-AUTH-0004', 'o Colaborador não lê (Configurações é do gestor)');
select throws_ok($$ select api.tenant_consent_set('comunicacoes_novidades', true) $$, '42501', 'ATTA-AUTH-0004',
                 'o Colaborador não grava');
select pg_temp.entrar(null, 'ADMIN');
select throws_ok($$ select api.tenant_consents_get() $$, '42501', 'ATTA-AUTH-0004', 'sem clínica: recusado');

select * from finish();
rollback;
