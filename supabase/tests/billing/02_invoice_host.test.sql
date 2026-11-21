-- MIG-32 (parte 3): link de fatura só do Asaas (Segurança, #272). Dados fictícios.
begin;
select plan(5);

insert into platform.tenant (id, name) values ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A');
insert into billing.checkout (tenant_id, reservation_id, reserved_at, window_start, attempts)
values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000c1', now(), now(), 1);
select set_config('role', 'service_role', true);
select api.billing_subscription_register('00000000-0000-4000-8000-00000000000a', 'asaas', 'cus_a', 'sub_a', 39900,
                                         '00000000-0000-4000-8000-0000000000c1');

create function pg_temp.evento(p_id text, p_url text) returns text language sql as $$
  select api.billing_apply_event('asaas', p_id, 'PAYMENT_CREATED', 'sub_a', 'pay_' || p_id, 'pendente',
                                 date '2026-12-21', 39900, p_url)
$$;
do $$ begin
  execute format('grant execute on all functions in schema %I to service_role', pg_my_temp_schema()::regnamespace);
end $$;

select is(pg_temp.evento('1', 'https://sandbox.asaas.com/i/ficticio'), 'aplicado', 'link do sandbox do Asaas entra');
select is(pg_temp.evento('2', 'https://www.asaas.com/i/ficticio'), 'aplicado', 'link da produção do Asaas entra');
select throws_ok($$ select pg_temp.evento('3', 'https://asaas.com.golpe.test/i/x') $$, '23514', null,
                 'host que só começa com asaas.com é recusado');
select throws_ok($$ select pg_temp.evento('4', 'https://golpe-asaas.com/i/x') $$, '23514', null,
                 'host que termina em asaas.com sem ponto é recusado');
select throws_ok($$ select pg_temp.evento('5', 'http://www.asaas.com/i/x') $$, '23514', null, 'http é recusado');

select * from finish();
rollback;
