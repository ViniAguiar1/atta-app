-- MIG-32 (ajustes): contratação da assinatura só pelo Gestor titular, com reserva no banco antes do gateway e limite
-- por clínica. PDD v206 §10.4.3 (cobrança da conta: só o Gestor titular; contratar e cancelar, pela distribuição do
-- Tech Lead de 21/11), §10.4.9 (a contratação) e §10.4.8 (Minha Assinatura).
--
-- - Reserva antes do gateway: api.billing_checkout_begin (pelo token do titular) grava a reserva da clínica e devolve o
--   id. O servidor só chama o Asaas com a reserva na mão e só registra a assinatura com ela. Dois cliques seguidos em
--   "contratar" não criam duas assinaturas: o 2º recebe ATTA-IN-0003 in_progress enquanto a reserva vale (2 min).
-- - Reserva vencida (o servidor caiu no meio) é retomada por quem pedir de novo. O gateway não duplica (procura pelo
--   externalReference antes de criar) e o registro com a reserva antiga é recusado (ATTA-IN-0003 reservation).
-- - Só o titular: membership.is_owner, ativo, na clínica do token. O ADMIN adicional e o Colaborador recebem 42501.
-- - Limite por clínica: 5 reservas por hora; passou, 54000 ATTA-IN-0003 rate_limit (o servidor devolve LIMITE).
-- - Clínica com assinatura viva: devolve a assinatura, sem reserva e sem contar tentativa. Cancelada: ATTA-IN-0003
--   status, até o PR da reativação (o PDD prevê; hoje a regra é uma assinatura por clínica).
-- Sempre para a frente.

create table billing.checkout (
  tenant_id uuid primary key references platform.tenant (id),
  reservation_id uuid,                 -- nula = nenhuma contratação em curso
  reserved_by uuid references auth.users (id) on delete set null,
  reserved_at timestamptz,
  window_start timestamptz not null,   -- janela de 1 hora do limite
  attempts integer not null default 0,
  constraint checkout_attempts_check check (attempts between 0 and 5),
  constraint checkout_reservation_check check ((reservation_id is null) = (reserved_at is null))
);
alter table billing.checkout enable row level security;
alter table billing.checkout force row level security;
revoke all on billing.checkout from public, anon, authenticated, service_role;

insert into audit.action (action, kind) values ('billing.checkout_begin', 'change')
on conflict (action) do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- api.billing_checkout_begin: o titular abre a contratação (antes de qualquer chamada ao gateway)
-- ---------------------------------------------------------------------------------------------------------------
create function api.billing_checkout_begin()
returns table (tenant_id uuid, reservation_id uuid, subscription_id uuid)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_user uuid := (select auth.uid());
  v_now timestamptz := pg_catalog.clock_timestamp();
  c billing.checkout;
  s billing.subscription;
  v_reservation uuid;
begin
  if v_tenant is null or v_user is null or not exists (
       select 1 from platform.membership m
       join platform.tenant t on t.id = m.tenant_id and t.deleted_at is null
       where m.tenant_id = v_tenant and m.user_id = v_user and m.is_owner and m.app_role = 'ADMIN'
         and m.status = 'active' and m.deleted_at is null) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;

  -- a linha da clínica serializa pedidos simultâneos: o 2º clique espera aqui e vê a reserva do 1º
  insert into billing.checkout (tenant_id, window_start) values (v_tenant, v_now) on conflict (tenant_id) do nothing;
  select * into c from billing.checkout ck where ck.tenant_id = v_tenant for update;

  select * into s from billing.subscription bs where bs.tenant_id = v_tenant;
  if s.id is not null then
    if s.status = 'cancelada' then
      raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'status';
    end if;
    return query select v_tenant, null::uuid, s.id;
    return;
  end if;

  if c.reservation_id is not null and c.reserved_at > v_now - interval '2 minutes' then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'in_progress';
  end if;
  if c.window_start <= v_now - interval '1 hour' then
    c.window_start := v_now;
    c.attempts := 0;
  end if;
  if c.attempts >= 5 then
    -- nada a gravar: o contador já está no teto, e o raise desfaria qualquer mudança
    raise exception using errcode = '54000', message = 'ATTA-IN-0003', detail = 'rate_limit';
  end if;

  v_reservation := gen_random_uuid();
  update billing.checkout ck
  set reservation_id = v_reservation, reserved_by = v_user, reserved_at = v_now,
      window_start = c.window_start, attempts = c.attempts + 1
  where ck.tenant_id = v_tenant;
  perform audit.record_event('billing.checkout_begin', 'billing.checkout', v_reservation, '{}'::jsonb, null,
                             jsonb_build_object('attempts', c.attempts + 1), v_tenant);
  return query select v_tenant, v_reservation, null::uuid;
end;
$$;
revoke all on function api.billing_checkout_begin() from public, anon;
grant execute on function api.billing_checkout_begin() to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- api.billing_subscription_register: agora só com a reserva vigente da clínica
-- ---------------------------------------------------------------------------------------------------------------
drop function api.billing_subscription_register(uuid, text, text, text, integer);

create function api.billing_subscription_register(p_tenant_id uuid, p_provider text, p_customer_external_id text,
                                                  p_subscription_external_id text, p_value_cents integer,
                                                  p_reservation_id uuid)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_event text;
  c billing.checkout;
begin
  if p_tenant_id is null or not exists (select 1 from platform.tenant t where t.id = p_tenant_id) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'tenant';
  end if;
  select * into c from billing.checkout ck where ck.tenant_id = p_tenant_id for update;

  -- repetir o registro da mesma assinatura devolve o mesmo id; outra assinatura na mesma clínica é recusada
  select s.id into v_id from billing.subscription s where s.tenant_id = p_tenant_id;
  if v_id is not null then
    select s.id into v_id from billing.subscription s
    where s.tenant_id = p_tenant_id and s.provider = p_provider and s.subscription_external_id = p_subscription_external_id;
    if v_id is null then
      raise exception using errcode = 'P0001', message = 'ATTA-IN-0002', detail = 'subscription';
    end if;
    return v_id;
  end if;

  if p_reservation_id is null or c.reservation_id is distinct from p_reservation_id then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'reservation';
  end if;

  insert into billing.subscription (tenant_id, provider, customer_external_id, subscription_external_id, value_cents)
  values (p_tenant_id, p_provider, p_customer_external_id, p_subscription_external_id, p_value_cents)
  returning id into v_id;
  update billing.checkout ck set reservation_id = null, reserved_at = null where ck.tenant_id = p_tenant_id;

  perform audit.record_event('billing.subscription_register', 'billing.subscription', v_id,
                             jsonb_build_object('provider', p_provider), null,
                             jsonb_build_object('status', 'aguardando_pagamento', 'value_cents', p_value_cents),
                             p_tenant_id);
  -- eventos que chegaram antes do registro, na ordem de chegada
  for v_event in select e.event_id from billing.event e
                 where e.provider = p_provider and e.subscription_external_id = p_subscription_external_id
                   and e.state = 'pendente'
                 order by e.received_at, e.event_id loop
    perform private.billing_apply(p_provider, v_event);
  end loop;
  return v_id;
end;
$$;
revoke all on function api.billing_subscription_register(uuid, text, text, text, integer, uuid)
  from public, anon, authenticated;
grant execute on function api.billing_subscription_register(uuid, text, text, text, integer, uuid) to service_role;
