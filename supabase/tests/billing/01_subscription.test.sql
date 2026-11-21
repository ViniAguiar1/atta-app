-- MIG-32 (parte 1): assinatura da clínica no gateway (PDD v206 §10.4.8, §23.2, §20.3, §10.4.3). Dados fictícios.
begin;
select plan(30);

insert into platform.tenant (id, name) values
  ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A'),
  ('00000000-0000-4000-8000-00000000000b', 'Clínica Fictícia B');

create function pg_temp.entrar(p_tenant uuid, p_role text) returns void language plpgsql as $$
declare
  v_user uuid := gen_random_uuid();
begin
  perform set_config('role', 'postgres', true);
  insert into auth.users (id, email) values (v_user, v_user::text || '@teste.invalid');
  insert into platform.membership (tenant_id, user_id, app_role) values (p_tenant, v_user, p_role);
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
-- lê as linhas como dona (schema fechado)
create function pg_temp.sub(p_tenant uuid) returns billing.subscription language sql security definer as $$
  select * from billing.subscription where tenant_id = p_tenant
$$;
create function pg_temp.pag(p_ext text) returns billing.payment language sql security definer as $$
  select * from billing.payment where payment_external_id = p_ext
$$;
create function pg_temp.evt(p_id text) returns billing.event language sql security definer as $$
  select * from billing.event where provider = 'asaas' and event_id = p_id
$$;
create function pg_temp.trilha(p_action text) returns int language sql security definer as $$
  select count(*)::int from audit.event where action = p_action
$$;
create function pg_temp.cobranca(p_evt text, p_pay text, p_status text, p_sub text default 'sub_ficticio_a')
returns text language sql as $$
  select api.billing_apply_event('asaas', p_evt, 'PAYMENT_X', p_sub, p_pay, p_status, date '2026-12-21', 39900,
                                 'https://sandbox.asaas.com/i/ficticio')
$$;
-- reserva da contratação como dona (o caminho do titular está no 03_checkout)
create function pg_temp.reservar(p_tenant uuid) returns uuid language sql security definer as $$
  insert into billing.checkout (tenant_id, reservation_id, reserved_at, window_start, attempts)
  values (p_tenant, gen_random_uuid(), now(), now(), 1)
  on conflict (tenant_id) do update set reservation_id = excluded.reservation_id, reserved_at = excluded.reserved_at
  returning reservation_id
$$;
create function pg_temp.checkout_b() returns billing.checkout language sql security definer as $$
  select * from billing.checkout where tenant_id = '00000000-0000-4000-8000-00000000000b'
$$;
do $$ begin
  execute format('grant execute on all functions in schema %I to service_role, authenticated', pg_my_temp_schema()::regnamespace);
end $$;

-- estrutura e permissões ------------------------------------------------------------------------------------------
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'billing' and c.relkind = 'r' and not (c.relrowsecurity and c.relforcerowsecurity)), 0,
          'toda tabela do billing com RLS forçada');
select ok(not has_table_privilege('service_role', 'billing.subscription', 'SELECT')
          and not has_table_privilege('authenticated', 'billing.payment', 'SELECT')
          and not has_table_privilege('service_role', 'billing.event', 'INSERT'), 'ninguém lê nem escreve direto');
select ok(not has_function_privilege('authenticated',
            'api.billing_apply_event(text, text, text, text, text, text, date, integer, text, boolean)', 'EXECUTE')
          and not has_function_privilege('authenticated',
            'api.billing_subscription_register(uuid, text, text, text, integer, uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'api.billing_subscription_status()', 'EXECUTE'),
          'webhook e registro só para o servidor; status não abre para anon');

-- webhook antes do registro: fica pendente --------------------------------------------------------------------------
select pg_temp.servidor();
select is(pg_temp.cobranca('evt_1', 'pay_1', 'pendente'), 'pendente', 'evento de assinatura ainda não registrada fica pendente');
select is(pg_temp.cobranca('evt_1', 'pay_1', 'pendente'), 'repetido', 'o mesmo evento reentregue não entra de novo');

-- registro -----------------------------------------------------------------------------------------------------------
select ok(api.billing_subscription_register('00000000-0000-4000-8000-00000000000a', 'asaas', 'cus_ficticio_a',
                                            'sub_ficticio_a', 39900,
                                            pg_temp.reservar('00000000-0000-4000-8000-00000000000a')) is not null,
          'assinatura registrada');
select is((pg_temp.evt('evt_1')).state, 'aplicado', 'o evento pendente é aplicado no registro');
select is(((pg_temp.pag('pay_1')).status, (pg_temp.pag('pay_1')).value_cents), ('pendente'::text, 39900),
          'e a 1ª cobrança aparece');
select is((pg_temp.sub('00000000-0000-4000-8000-00000000000a')).status, 'aguardando_pagamento',
          'sem pagamento, a assinatura aguarda');
select is(api.billing_subscription_register('00000000-0000-4000-8000-00000000000a', 'asaas', 'cus_ficticio_a',
                                            'sub_ficticio_a', 39900, null),
          (pg_temp.sub('00000000-0000-4000-8000-00000000000a')).id, 'repetir o registro devolve o mesmo id');
select throws_ok($$ select api.billing_subscription_register('00000000-0000-4000-8000-00000000000a', 'asaas',
                    'cus_ficticio_a', 'sub_outra', 39900, null) $$, 'P0001', 'ATTA-IN-0002',
                 'uma 2ª assinatura na mesma clínica é recusada');
select throws_ok($$ select api.billing_subscription_register('00000000-0000-4000-8000-0000000000ff', 'asaas',
                    'cus_x', 'sub_x', 39900, gen_random_uuid()) $$, 'P0001', 'ATTA-IN-0001', 'clínica inexistente é recusada');
select pg_temp.reservar('00000000-0000-4000-8000-00000000000b');
select throws_ok($$ select api.billing_subscription_register('00000000-0000-4000-8000-00000000000b', 'asaas',
                    'cus_b', 'sub_b', 0, (select reservation_id from pg_temp.checkout_b())) $$, '23514', null, 'valor zero é recusado');
select is(pg_temp.trilha('billing.subscription_register'), 1, 'o registro vai para a trilha uma vez');

-- pagamento, atraso e ordem dos eventos ------------------------------------------------------------------------------
select is(pg_temp.cobranca('evt_2', 'pay_1', 'paga'), 'aplicado', 'pagamento aplicado');
select is(((pg_temp.pag('pay_1')).status, (pg_temp.pag('pay_1')).paid_at is not null), ('paga'::text, true),
          'cobrança paga, com a hora');
select is((pg_temp.sub('00000000-0000-4000-8000-00000000000a')).status, 'ativa', 'assinatura ativa');
select is(pg_temp.cobranca('evt_3', 'pay_1', 'pendente'), 'aplicado', 'evento atrasado é aceito');
select is((pg_temp.pag('pay_1')).status, 'paga', 'mas a cobrança paga não volta a pendente');
select is(pg_temp.cobranca('evt_4', 'pay_2', 'vencida'), 'aplicado', 'cobrança do mês seguinte vencida');
select is((pg_temp.sub('00000000-0000-4000-8000-00000000000a')).status, 'em_atraso', 'assinatura em atraso (D+1, §10.4.8)');
select is(pg_temp.trilha('billing.subscription_status'), 2, 'cada troca de status vai para a trilha');
select is(pg_temp.cobranca('evt_5', 'pay_2', 'paga'), 'aplicado', 'pagou a vencida');
select is((pg_temp.sub('00000000-0000-4000-8000-00000000000a')).status, 'ativa', 'volta a ativa');
select throws_ok($$ select pg_temp.cobranca('evt_6', 'pay_3', 'quitada') $$, '23514', null,
                 'status de cobrança fora da lista é recusado');

-- Minha Assinatura: só a própria clínica e só quem vê Configurações --------------------------------------------------
select pg_temp.cobranca('evt_7', 'pay_3', 'pendente');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select is((select (status, value_cents, next_value_cents, next_invoice_url, overdue_count)::text
           from api.billing_subscription_status()),
          '(ativa,39900,39900,https://sandbox.asaas.com/i/ficticio,0)', 'o ADMIN vê o status e a próxima cobrança');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'COLABORADOR');
select throws_ok($$ select * from api.billing_subscription_status() $$, '42501', 'ATTA-AUTH-0004',
                 'o Colaborador não vê a assinatura (Configurações é do ADMIN)');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'ADMIN');
select is((select count(*)::int from api.billing_subscription_status()), 0, 'a clínica B não vê a assinatura da A');

-- cancelamento no gateway ------------------------------------------------------------------------------------------
select pg_temp.servidor();
select is(api.billing_apply_event('asaas', 'evt_8', 'SUBSCRIPTION_DELETED', 'sub_ficticio_a', p_subscription_removed => true),
          'aplicado', 'assinatura removida no gateway');
select is((pg_temp.sub('00000000-0000-4000-8000-00000000000a')).status, 'cancelada', 'fica cancelada');

select * from finish();
rollback;
