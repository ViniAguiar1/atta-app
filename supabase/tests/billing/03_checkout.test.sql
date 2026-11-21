-- MIG-32 (ajustes): contratação só pelo Gestor titular, reserva antes do gateway e limite por clínica
-- (PDD v206 §10.4.3, §10.4.9). Dados fictícios.
begin;
select plan(21);

insert into platform.tenant (id, name) values
  ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A'),
  ('00000000-0000-4000-8000-00000000000b', 'Clínica Fictícia B');

-- cria o usuário uma vez por (clínica, papel) e entra com ele
create function pg_temp.entrar(p_tenant uuid, p_role text, p_owner boolean default false) returns void
language plpgsql as $$
declare
  v_email text := p_tenant::text || '-' || lower(p_role) || case when p_owner then '-titular' else '' end
                  || '@teste.invalid';
  v_user uuid;
begin
  perform set_config('role', 'postgres', true);
  select id into v_user from auth.users where email = v_email;
  if v_user is null then
    v_user := gen_random_uuid();
    insert into auth.users (id, email) values (v_user, v_email);
    insert into platform.membership (tenant_id, user_id, app_role, is_owner) values (p_tenant, v_user, p_role, p_owner);
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'tenant_id', p_tenant, 'app_role', p_role,
                      'aal', case when p_role = 'ADMIN' then 'aal2' else 'aal1' end,
                      'amr', json_build_array(json_build_object('method', 'password',
                                                                'timestamp', extract(epoch from now())::bigint)))::text, true);
end $$;
create function pg_temp.servidor() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'service_role', true);
end $$;
create function pg_temp.checkout(p_tenant uuid) returns billing.checkout language sql security definer as $$
  select * from billing.checkout where tenant_id = p_tenant
$$;
-- o tempo passa: a reserva vence (2 min) ou a janela do limite fecha (1 h)
create function pg_temp.vencer_reserva(p_tenant uuid) returns void language sql security definer as $$
  update billing.checkout set reserved_at = clock_timestamp() - interval '3 minutes' where tenant_id = p_tenant
$$;
create function pg_temp.fechar_janela(p_tenant uuid) returns void language sql security definer as $$
  update billing.checkout set window_start = clock_timestamp() - interval '2 hours',
                              reserved_at = case when reserved_at is not null
                                                 then clock_timestamp() - interval '3 minutes' end
  where tenant_id = p_tenant
$$;
create function pg_temp.trilha(p_action text) returns int language sql security definer as $$
  select count(*)::int from audit.event where action = p_action
$$;
create function pg_temp.registrar(p_reservation uuid) returns uuid language sql as $$
  select api.billing_subscription_register('00000000-0000-4000-8000-00000000000a', 'asaas', 'cus_ficticio_a',
                                           'sub_ficticio_a', 39900, p_reservation)
$$;
create table pg_temp.guardado (nome text primary key, valor uuid);
do $$ begin
  execute format('grant execute on all functions in schema %I to service_role, authenticated',
                 pg_my_temp_schema()::regnamespace);
  execute format('grant all on all tables in schema %I to service_role, authenticated', pg_my_temp_schema()::regnamespace);
end $$;

-- permissões ---------------------------------------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'api.billing_checkout_begin()', 'EXECUTE')
          and not has_function_privilege('anon', 'api.billing_checkout_begin()', 'EXECUTE'),
          'a contratação abre pelo token, nunca para anon');
select ok(not has_table_privilege('authenticated', 'billing.checkout', 'SELECT')
          and not has_table_privilege('service_role', 'billing.checkout', 'UPDATE'), 'ninguém mexe na reserva direto');

-- só o Gestor titular ------------------------------------------------------------------------------------------------
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'COLABORADOR');
select throws_ok($$ select * from api.billing_checkout_begin() $$, '42501', 'ATTA-AUTH-0004',
                 'o Colaborador não contrata');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select throws_ok($$ select * from api.billing_checkout_begin() $$, '42501', 'ATTA-AUTH-0004',
                 'o gestor adicional (ADMIN sem titularidade) não contrata');

select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN', true);
insert into pg_temp.guardado select 'r1', reservation_id from api.billing_checkout_begin();
select ok((select valor from pg_temp.guardado where nome = 'r1') is not null, 'o titular abre a contratação');
select throws_ok($$ select * from api.billing_checkout_begin() $$, 'P0001', 'ATTA-IN-0003',
                 'o 2º clique, com a reserva valendo, é recusado antes do gateway');

-- o registro exige a reserva vigente ---------------------------------------------------------------------------------
select pg_temp.servidor();
select throws_ok($$ select pg_temp.registrar(null) $$, 'P0001', 'ATTA-IN-0003', 'registro sem reserva é recusado');
select throws_ok($$ select pg_temp.registrar(gen_random_uuid()) $$, 'P0001', 'ATTA-IN-0003',
                 'registro com reserva de outro pedido é recusado');

-- reserva vencida (servidor caiu no meio): o próximo pedido retoma, e a reserva antiga não registra mais
select pg_temp.vencer_reserva('00000000-0000-4000-8000-00000000000a');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN', true);
insert into pg_temp.guardado select 'r2', reservation_id from api.billing_checkout_begin();
select isnt((select valor from pg_temp.guardado where nome = 'r2'), (select valor from pg_temp.guardado where nome = 'r1'),
            'reserva vencida é retomada com outro id');
select pg_temp.servidor();
select throws_ok($$ select pg_temp.registrar((select valor from pg_temp.guardado where nome = 'r1')) $$,
                 'P0001', 'ATTA-IN-0003', 'a reserva vencida e retomada não registra');
select ok(pg_temp.registrar((select valor from pg_temp.guardado where nome = 'r2')) is not null,
          'a reserva vigente registra a assinatura');
select is((pg_temp.checkout('00000000-0000-4000-8000-00000000000a')).reservation_id, null,
          'o registro libera a reserva');

-- com assinatura viva, contratar de novo devolve a mesma, sem reserva --------------------------------------------------
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN', true);
select is((select (reservation_id is null and subscription_id is not null
                   and tenant_id = '00000000-0000-4000-8000-00000000000a') from api.billing_checkout_begin()),
          true, 'clínica com assinatura recebe a assinatura, sem nova reserva');
select is(pg_temp.trilha('billing.checkout_begin'), 2, 'cada reserva vai para a trilha');

-- cancelada: reativação fica para o PR próprio -------------------------------------------------------------------------
select pg_temp.servidor();
select api.billing_apply_event('asaas', 'evt_fim', 'SUBSCRIPTION_DELETED', 'sub_ficticio_a',
                               p_subscription_removed => true);
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN', true);
select throws_ok($$ select * from api.billing_checkout_begin() $$, 'P0001', 'ATTA-IN-0003',
                 'assinatura cancelada não recontrata por aqui');

-- limite por clínica: 5 por hora ---------------------------------------------------------------------------------------
select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'ADMIN', true);
select is((select tenant_id from api.billing_checkout_begin()), '00000000-0000-4000-8000-00000000000b'::uuid,
          'a reserva é da clínica do token');
select pg_temp.vencer_reserva('00000000-0000-4000-8000-00000000000b');
select api.billing_checkout_begin();
select pg_temp.vencer_reserva('00000000-0000-4000-8000-00000000000b');
select api.billing_checkout_begin();
select pg_temp.vencer_reserva('00000000-0000-4000-8000-00000000000b');
select api.billing_checkout_begin();
select pg_temp.vencer_reserva('00000000-0000-4000-8000-00000000000b');
select lives_ok($$ select api.billing_checkout_begin() $$, 'a 5ª tentativa na hora passa');
select pg_temp.vencer_reserva('00000000-0000-4000-8000-00000000000b');
select throws_ok($$ select api.billing_checkout_begin() $$, '54000', 'ATTA-IN-0003', 'a 6ª na mesma hora é barrada');
select is((pg_temp.checkout('00000000-0000-4000-8000-00000000000b')).attempts, 5, 'o contador para no teto');
select pg_temp.fechar_janela('00000000-0000-4000-8000-00000000000b');
select lives_ok($$ select api.billing_checkout_begin() $$, 'na hora seguinte volta a passar');
select is((pg_temp.checkout('00000000-0000-4000-8000-00000000000a')).attempts, 2,
          'o limite de uma clínica não conta as tentativas da outra');

select * from finish();
rollback;
