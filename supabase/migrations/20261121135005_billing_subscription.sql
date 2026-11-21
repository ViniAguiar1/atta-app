-- MIG-32 (parte 1): assinatura da clínica no gateway de cobrança (Asaas). Schema billing, fechado (ADR 0001 §1).
--
-- PDD v206 §10.4.8 ("Minha Assinatura": demonstrativo, "O ATTA-in só tem cobrança mensal", pendente em D+1),
-- §23.2 e §23.3 (R$ 399/mês por estabelecimento, mensalidade fixa por clínica), §20.3 ("Asaas | Cobrança da
-- mensalidade e dos valores variáveis") e §10.4.3 (cancelar e alterar dados de cobrança: só o Gestor titular).
--
-- - Uma assinatura por clínica. O servidor cria o cliente e a assinatura no gateway e registra aqui os ids externos.
-- - Nenhum dado de cartão passa pelo ATTA: a forma de pagamento é escolhida na página de cobrança do próprio gateway.
-- - Webhook: billing.event deduplica pelo id do evento e é a trilha do gateway, só com ids e status. Evento que chega
--   antes do registro da assinatura fica 'pendente' e é aplicado no registro (o gateway gera a 1ª cobrança na hora).
-- - Status da cobrança nunca regride (webhook fora de ordem). A régua de inadimplência (§10.4.8: D+5, D+30...) e os
--   itens variáveis da fatura entram em PRs próprios; aqui o status vai de aguardando_pagamento a ativa, em_atraso e
--   cancelada, e 'suspensa' fica reservado para a régua.
-- - Schema fechado: só funções SECURITY DEFINER. As do servidor para service_role; a clínica lê o status por
--   api.billing_subscription_status (settings.view, só ADMIN, PDD §10.4.3).

create table billing.subscription (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenant (id),
  provider text not null,
  customer_external_id text not null,
  subscription_external_id text not null,
  status text not null default 'aguardando_pagamento',
  value_cents integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_tenant_uq unique (tenant_id),
  constraint subscription_external_uq unique (provider, subscription_external_id),
  constraint subscription_provider_check check (provider in ('asaas', 'simulador')),
  constraint subscription_status_check check (status in ('aguardando_pagamento', 'ativa', 'em_atraso', 'suspensa',
                                                         'cancelada')),
  constraint subscription_value_check check (value_cents > 0),
  constraint subscription_ids_check check (length(customer_external_id) between 1 and 100
                                           and length(subscription_external_id) between 1 and 100)
);

create table billing.payment (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenant (id),
  subscription_id uuid not null references billing.subscription (id),
  payment_external_id text not null,
  due_date date not null,
  value_cents integer not null,
  status text not null,
  invoice_url text,                    -- página de cobrança do gateway (lá a clínica escolhe boleto, Pix ou cartão)
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_external_uq unique (subscription_id, payment_external_id),
  constraint payment_status_check check (status in ('pendente', 'paga', 'vencida', 'estornada', 'removida')),
  constraint payment_value_check check (value_cents >= 0),
  constraint payment_id_check check (length(payment_external_id) between 1 and 100),
  constraint payment_invoice_check check (invoice_url is null or (invoice_url ~ '^https://' and length(invoice_url) <= 300))
);
create index payment_tenant_due_idx on billing.payment (tenant_id, due_date);

-- Trilha do gateway: só ids, tipo e status (nada de nome, CNPJ, e-mail ou dado de cartão).
create table billing.event (
  provider text not null,
  event_id text not null,
  event_type text not null,
  subscription_external_id text not null,
  payment_external_id text,
  payment_status text,
  due_date date,
  value_cents integer,
  invoice_url text,
  subscription_removed boolean not null default false,
  state text not null,                 -- aplicado | pendente (assinatura ainda não registrada)
  tenant_id uuid references platform.tenant (id),
  received_at timestamptz not null default now(),
  applied_at timestamptz,
  primary key (provider, event_id),
  constraint event_state_check check (state in ('aplicado', 'pendente')),
  constraint event_ids_check check (length(event_id) between 1 and 100 and length(event_type) between 1 and 60
                                    and length(subscription_external_id) between 1 and 100
                                    and (payment_external_id is null or length(payment_external_id) between 1 and 100)),
  constraint event_payment_check check (
    (payment_external_id is null and payment_status is null)
    or (payment_external_id is not null and payment_status in ('pendente', 'paga', 'vencida', 'estornada', 'removida')
        and due_date is not null and value_cents >= 0)),
  constraint event_invoice_check check (invoice_url is null or (invoice_url ~ '^https://' and length(invoice_url) <= 300))
);
create index event_pending_idx on billing.event (provider, subscription_external_id) where state = 'pendente';

alter table billing.subscription enable row level security;
alter table billing.subscription force row level security;
alter table billing.payment enable row level security;
alter table billing.payment force row level security;
alter table billing.event enable row level security;
alter table billing.event force row level security;
revoke all on billing.subscription, billing.payment, billing.event from public, anon, authenticated, service_role;

insert into audit.action (action, kind) values
  ('billing.subscription_register', 'change'),
  ('billing.subscription_status', 'change')
on conflict (action) do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- Interna: aplica um evento à assinatura (cobrança sem regredir; status da assinatura derivado das cobranças)
-- ---------------------------------------------------------------------------------------------------------------
create function private.billing_apply(p_provider text, p_event_id text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  e billing.event;
  s billing.subscription;
  v_rank jsonb := '{"pendente": 0, "vencida": 1, "paga": 2, "estornada": 3, "removida": 3}';
  v_old text;
  v_new text;
begin
  select * into e from billing.event where provider = p_provider and event_id = p_event_id for update;
  select * into s from billing.subscription
  where provider = e.provider and subscription_external_id = e.subscription_external_id for update;
  if s.id is null then return; end if;   -- continua pendente

  if e.payment_external_id is not null then
    select p.status into v_old from billing.payment p
    where p.subscription_id = s.id and p.payment_external_id = e.payment_external_id for update;
    if v_old is null then
      insert into billing.payment (tenant_id, subscription_id, payment_external_id, due_date, value_cents, status,
                                   invoice_url, paid_at)
      values (s.tenant_id, s.id, e.payment_external_id, e.due_date, e.value_cents, e.payment_status, e.invoice_url,
              case when e.payment_status = 'paga' then now() end);
    elsif (v_rank ->> e.payment_status)::int > (v_rank ->> v_old)::int then
      update billing.payment p
      set status = e.payment_status, due_date = e.due_date, value_cents = e.value_cents,
          invoice_url = coalesce(e.invoice_url, p.invoice_url),
          paid_at = case when e.payment_status = 'paga' then now() else p.paid_at end, updated_at = now()
      where p.subscription_id = s.id and p.payment_external_id = e.payment_external_id;
    end if;   -- atrasado ou repetido: não muda a cobrança
  end if;

  v_new := case
    when s.status = 'cancelada' or e.subscription_removed then 'cancelada'
    when s.status = 'suspensa' then 'suspensa'   -- só a régua tira da suspensão (PR próprio)
    when exists (select 1 from billing.payment p where p.subscription_id = s.id and p.status = 'vencida') then 'em_atraso'
    when exists (select 1 from billing.payment p where p.subscription_id = s.id and p.status = 'paga') then 'ativa'
    else s.status end;
  if v_new <> s.status then
    update billing.subscription set status = v_new, updated_at = now() where id = s.id;
    perform audit.record_event('billing.subscription_status', 'billing.subscription', s.id,
                               jsonb_build_object('provider', s.provider, 'event_id', e.event_id),
                               jsonb_build_object('status', s.status), jsonb_build_object('status', v_new), s.tenant_id);
  end if;
  update billing.event set state = 'aplicado', tenant_id = s.tenant_id, applied_at = now()
  where provider = e.provider and event_id = e.event_id;
end;
$$;
revoke all on function private.billing_apply(text, text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- api do servidor: registrar a assinatura criada no gateway, aplicar webhook e ler a assinatura de uma clínica
-- ---------------------------------------------------------------------------------------------------------------
create function api.billing_subscription_register(p_tenant_id uuid, p_provider text, p_customer_external_id text,
                                                  p_subscription_external_id text, p_value_cents integer)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_event text;
begin
  if p_tenant_id is null or not exists (select 1 from platform.tenant t where t.id = p_tenant_id) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'tenant';
  end if;
  insert into billing.subscription (tenant_id, provider, customer_external_id, subscription_external_id, value_cents)
  values (p_tenant_id, p_provider, p_customer_external_id, p_subscription_external_id, p_value_cents)
  on conflict (tenant_id) do nothing
  returning id into v_id;
  if v_id is null then
    -- repetir o registro da mesma assinatura devolve o mesmo id; outra assinatura na mesma clínica é recusada
    select s.id into v_id from billing.subscription s
    where s.tenant_id = p_tenant_id and s.provider = p_provider and s.subscription_external_id = p_subscription_external_id;
    if v_id is null then
      raise exception using errcode = 'P0001', message = 'ATTA-IN-0002', detail = 'subscription';
    end if;
    return v_id;
  end if;
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

-- Webhook do gateway, já autenticado e traduzido pelo servidor. Devolve 'aplicado', 'pendente' ou 'repetido'.
create function api.billing_apply_event(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_subscription_external_id text,
  p_payment_external_id text default null,
  p_payment_status text default null,
  p_due_date date default null,
  p_value_cents integer default null,
  p_invoice_url text default null,
  p_subscription_removed boolean default false
) returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_new boolean;
begin
  if p_provider not in ('asaas', 'simulador') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'provider';
  end if;
  insert into billing.event (provider, event_id, event_type, subscription_external_id, payment_external_id,
                             payment_status, due_date, value_cents, invoice_url, subscription_removed, state)
  values (p_provider, p_event_id, p_event_type, p_subscription_external_id, p_payment_external_id, p_payment_status,
          p_due_date, p_value_cents, p_invoice_url, coalesce(p_subscription_removed, false), 'pendente')
  on conflict (provider, event_id) do nothing
  returning true into v_new;
  if v_new is null then return 'repetido'; end if;   -- o gateway reentrega: o mesmo evento não aplica duas vezes
  perform private.billing_apply(p_provider, p_event_id);
  return (select e.state from billing.event e where e.provider = p_provider and e.event_id = p_event_id);
end;
$$;

-- Leitura do servidor (ex.: não criar uma 2ª assinatura no gateway para a mesma clínica).
create function api.billing_subscription_get(p_tenant_id uuid)
returns table (id uuid, provider text, customer_external_id text, subscription_external_id text, status text,
               value_cents integer)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.provider, s.customer_external_id, s.subscription_external_id, s.status, s.value_cents
  from billing.subscription s where s.tenant_id = p_tenant_id
$$;

revoke all on function api.billing_subscription_register(uuid, text, text, text, integer),
  api.billing_apply_event(text, text, text, text, text, text, date, integer, text, boolean),
  api.billing_subscription_get(uuid) from public, anon, authenticated;
grant execute on function api.billing_subscription_register(uuid, text, text, text, integer),
  api.billing_apply_event(text, text, text, text, text, text, date, integer, text, boolean),
  api.billing_subscription_get(uuid) to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Minha Assinatura (§10.4.8): status da própria clínica, só para quem vê Configurações (ADMIN, §10.4.3)
-- ---------------------------------------------------------------------------------------------------------------
create function api.billing_subscription_status()
returns table (status text, value_cents integer, next_due_date date, next_value_cents integer,
               next_invoice_url text, overdue_count integer)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid := (select private.current_tenant_id());
begin
  if v_tenant is null or not coalesce((select private.has_permission('settings', 'view')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  return query
  select s.status, s.value_cents, n.due_date, n.value_cents, n.invoice_url,
         (select count(*)::int from billing.payment p where p.subscription_id = s.id and p.status = 'vencida')
  from billing.subscription s
  left join lateral (
    select p.due_date, p.value_cents, p.invoice_url from billing.payment p
    where p.subscription_id = s.id and p.status in ('pendente', 'vencida')
    order by p.due_date, p.id limit 1
  ) n on true
  where s.tenant_id = v_tenant;
end;
$$;
revoke all on function api.billing_subscription_status() from public, anon;
grant execute on function api.billing_subscription_status() to authenticated;
