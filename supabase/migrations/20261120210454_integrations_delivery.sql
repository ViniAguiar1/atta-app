-- MIG-30 (parte 3): fila de envio de mensagens (e-mail, WhatsApp e SMS). ADR 0005 §1; semântica de fila do ADR 0028.
--
-- PDD v206 §9.4 ("Serviço de Notificação: envio multicanal com fila, tentativa de reenvio, registro de entrega e
-- supressão por preferência"), §21 (RN-NOT-01: nenhuma mensagem com dado de saúde; RN-NOT-02: os essenciais nunca
-- são suprimidos), §10.2.1 e §10.2.3 (WhatsApp com SMS quando falhar; "Todo envio e reenvio fica registrado (horário,
-- canal, autor e resultado)") e §10.4.6 (consumo de mensagens: conta o que foi entregue).
--
-- - Destinatário por referência (person, provisional_patient, professional = id do vínculo, membership); o contato é
--   resolvido e decifrado no servidor na hora do envio. Endereço cru só no convite de equipe (email_novo), cifrado.
-- - Catálogo de modelos no banco (espelho de src/server/integracoes/mensageria/modelos.ts, com teste de paridade):
--   variável fora do modelo é recusada já no enfileirar, então texto livre nunca é gravado.
-- - Código de verificação e links com segredo são apagados da linha quando o envio termina.
-- - Schema integrations fechado: só funções SECURITY DEFINER; as da fila para service_role e postgres (tenant explícito,
--   conferido contra a referência); a clínica lê o histórico por api.delivery_list, com o destino mascarado.

-- ---------------------------------------------------------------------------------------------------------------
-- Catálogo de modelos (o valor de cada variável é validado no servidor, em modelos.ts, antes de sair)
-- ---------------------------------------------------------------------------------------------------------------
create table integrations.template (
  id text primary key,
  channels text[] not null,
  variables text[] not null,
  essential boolean not null,           -- RN-NOT-02: essencial nunca é suprimido
  redact_after_send boolean not null,   -- leva código ou link com segredo: apagado quando o envio termina
  constraint template_channels_check check (channels <@ array['whatsapp', 'sms', 'email'] and cardinality(channels) > 0)
);

insert into integrations.template (id, channels, variables, essential, redact_after_send) values
  ('codigo_verificacao', '{whatsapp,sms}', '{codigo}', true, true),
  ('link_checkin', '{whatsapp,sms}', '{nome_clinica,data_hora,link}', true, true),
  ('lembrete_checkin', '{whatsapp,sms}', '{nome_clinica,data_hora,link}', true, true),
  ('link_termos', '{whatsapp,sms}', '{nome_clinica,link}', true, true),
  ('link_boarding_check', '{whatsapp,sms}', '{nome_clinica,data_hora,link}', true, true),
  ('confirmacao_agendamento', '{whatsapp,sms}', '{nome_clinica,data_hora}', true, false),
  ('alerta_equipe', '{email,whatsapp}', '{evento,data_hora,link}', false, false),
  ('resumo_equipe', '{email,whatsapp}', '{periodo,link}', false, false),
  ('aviso_cobranca', '{email}', '{valor,vencimento,dias,link}', true, false),
  ('relatorio_importacao', '{email,whatsapp}', '{linhas,link}', true, false),
  ('documentos_assinados', '{email}', '{nome_clinica}', true, false),
  ('convite_equipe', '{email}', '{nome_clinica,link}', true, true),
  ('convite_propass', '{email}', '{nome_clinica,link}', true, true);

-- ---------------------------------------------------------------------------------------------------------------
-- Envios, histórico de estados e webhooks já processados
-- ---------------------------------------------------------------------------------------------------------------
create table integrations.delivery (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenant (id),
  channel text not null,
  template_id text not null references integrations.template (id),
  recipient_kind text not null,
  recipient_id uuid,
  -- só no convite de equipe para e-mail novo: o endereço cifrado pelo servidor (AAD integrations.delivery|<coluna>|<id>)
  recipient_address_enc bytea,
  recipient_dek_wrapped bytea,
  recipient_kek_version smallint,
  variables jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  priority smallint not null default 1,            -- 0 = imediata (código), 1 = normal
  state text not null default 'pendente',
  attempts smallint not null default 0,
  next_attempt_at timestamptz not null default now(),
  valid_until timestamptz,                         -- depois disso o envio perde o sentido e expira
  alternatives text[] not null default '{}',       -- canais seguintes se este falhar de vez (WhatsApp → SMS)
  origin_delivery_id uuid references integrations.delivery (id),
  reference_kind text,                             -- o que originou o envio (appointment, access_grant…), sem dado pessoal
  reference_id uuid,
  external_id text,
  destination_masked text,                         -- gravado pelo servidor no envio (só o final do número, PDD §11.4)
  last_error_kind text,
  last_error_code text,
  billable boolean,                                -- WhatsApp/SMS entregue = consumo (§10.4.6, LAC-047)
  author text not null,                            -- 'sistema' ou o id do usuário que pediu
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_channel_check check (channel in ('whatsapp', 'sms', 'email')),
  constraint delivery_state_check check (state in ('pendente', 'enviando', 'enviado', 'entregue', 'lido', 'falhou',
    'cancelado', 'expirado', 'bloqueado_stage')),
  constraint delivery_recipient_check check (
    (recipient_kind in ('person', 'provisional_patient', 'professional', 'membership') and recipient_id is not null
      and recipient_address_enc is null)
    or (recipient_kind = 'email_novo' and recipient_id is null and template_id = 'convite_equipe' and channel = 'email'
      and num_nulls(recipient_address_enc, recipient_dek_wrapped, recipient_kek_version) = 0)),
  constraint delivery_priority_check check (priority in (0, 1)),
  constraint delivery_alternatives_check check (alternatives <@ array['whatsapp', 'sms', 'email']),
  constraint delivery_key_check check (length(idempotency_key) between 1 and 200),
  constraint delivery_masked_check check (destination_masked is null or length(destination_masked) <= 60),
  constraint delivery_idempotency_uq unique (tenant_id, idempotency_key)
);
create index delivery_ready_idx on integrations.delivery (priority, next_attempt_at) where state in ('pendente', 'enviando');
create unique index delivery_external_uq on integrations.delivery (channel, external_id) where external_id is not null;
create index delivery_reference_idx on integrations.delivery (tenant_id, reference_kind, reference_id);
create index delivery_tenant_created_idx on integrations.delivery (tenant_id, created_at desc);

create table integrations.delivery_event (
  id bigint generated always as identity primary key,
  delivery_id uuid not null references integrations.delivery (id),
  tenant_id uuid not null,
  state text not null,
  code text,
  at timestamptz not null default now()
);
create index delivery_event_delivery_idx on integrations.delivery_event (delivery_id, id);

create table integrations.webhook_received (
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id),
  constraint webhook_received_event_check check (length(event_id) between 1 and 200)
);

alter table integrations.template enable row level security;
alter table integrations.template force row level security;
alter table integrations.delivery enable row level security;
alter table integrations.delivery force row level security;
alter table integrations.delivery_event enable row level security;
alter table integrations.delivery_event force row level security;
alter table integrations.webhook_received enable row level security;
alter table integrations.webhook_received force row level security;
revoke all on integrations.template, integrations.delivery, integrations.delivery_event, integrations.webhook_received
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Internas: histórico, apagar segredo e o envio alternativo
-- ---------------------------------------------------------------------------------------------------------------
create function private.delivery_log(p_id uuid, p_tenant uuid, p_state text, p_code text default null,
                                     p_at timestamptz default null) returns void
language sql security definer set search_path = ''
as $$
  insert into integrations.delivery_event (delivery_id, tenant_id, state, code, at)
  values (p_id, p_tenant, p_state, p_code, coalesce(p_at, now()))
$$;

-- tira os valores das variáveis do modelo com código ou link com segredo (fica só o nome de cada uma)
create function private.delivery_redact(p_id uuid) returns void
language sql security definer set search_path = ''
as $$
  update integrations.delivery d
  set variables = (select coalesce(jsonb_object_agg(k, '***'), '{}'::jsonb) from jsonb_object_keys(d.variables) k)
  from integrations.template t
  where d.id = p_id and t.id = d.template_id and t.redact_after_send and d.variables <> '{}'::jsonb
$$;

-- falha definitiva: enfileira o mesmo envio no próximo canal da lista, se o modelo existe nele e ainda é válido
create function private.delivery_enqueue_alternative(p_id uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v integrations.delivery;
  v_next text;
  v_new uuid;
begin
  select * into v from integrations.delivery d where d.id = p_id;
  v_next := v.alternatives[1];
  if v_next is null or (v.valid_until is not null and v.valid_until <= now())
     or exists (select 1 from jsonb_each_text(v.variables) e where e.value = '***')   -- segredo já apagado
     or not exists (select 1 from integrations.template t where t.id = v.template_id and v_next = any (t.channels)) then
    return null;
  end if;
  insert into integrations.delivery (tenant_id, channel, template_id, recipient_kind, recipient_id, variables,
                                     idempotency_key, priority, valid_until, alternatives, origin_delivery_id,
                                     reference_kind, reference_id, author)
  values (v.tenant_id, v_next, v.template_id, v.recipient_kind, v.recipient_id, v.variables,
          left(v.idempotency_key, 180) || ':alt:' || v_next, v.priority, v.valid_until, v.alternatives[2:],
          v.id, v.reference_kind, v.reference_id, 'sistema')
  on conflict (tenant_id, idempotency_key) do nothing
  returning id into v_new;
  if v_new is not null then
    perform private.delivery_log(v_new, v.tenant_id, 'pendente', 'alternativa');
  end if;
  return v_new;
end;
$$;

revoke all on function private.delivery_log(uuid, uuid, text, text, timestamptz), private.delivery_redact(uuid),
  private.delivery_enqueue_alternative(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- api da fila (servidor e domínio): enfileirar, reivindicar, marcar, aplicar retorno e deduplicar webhook
-- ---------------------------------------------------------------------------------------------------------------
create function api.delivery_enqueue(
  p_tenant_id uuid,
  p_channel text,
  p_template_id text,
  p_recipient_kind text,
  p_recipient_id uuid,
  p_variables jsonb,
  p_idempotency_key text,
  p_author text,
  p_priority smallint default 1,
  p_valid_until timestamptz default null,
  p_scheduled_for timestamptz default null,
  p_alternatives text[] default '{}',
  p_reference_kind text default null,
  p_reference_id uuid default null,
  p_id uuid default null,                          -- convite para e-mail novo: o servidor gera (entra no AAD)
  p_address_enc bytea default null,
  p_dek_wrapped bytea default null,
  p_kek_version smallint default null
) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  t integrations.template;
  v_id uuid;
  v_ok boolean;
begin
  select * into t from integrations.template where id = p_template_id;
  if not found or p_channel is null or not (p_channel = any (t.channels)) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'template';
  end if;
  -- RN-NOT-01: só as variáveis do modelo, todas texto (sem texto livre gravado)
  if p_variables is null or jsonb_typeof(p_variables) <> 'object'
     or exists (select 1 from jsonb_each(p_variables) e where not (e.key = any (t.variables)) or jsonb_typeof(e.value) <> 'string')
     or exists (select 1 from unnest(t.variables) n where not p_variables ? n) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'variables';
  end if;
  if p_tenant_id is null or p_author is null or length(p_author) not between 1 and 64 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'tenant';
  end if;
  -- a referência tem de ser da clínica que envia (ADR 0005 §1: tenant explícito, conferido)
  v_ok := case p_recipient_kind
    when 'person' then exists (select 1 from network.person_tenant_link l
                               where l.tenant_id = p_tenant_id and l.person_id = p_recipient_id)
    when 'provisional_patient' then exists (select 1 from network.person_import_provisional p
                                            where p.tenant_id = p_tenant_id and p.id = p_recipient_id
                                              and p.status = 'pendente')
    when 'professional' then exists (select 1 from platform.professional_tenant_link l
                                     where l.tenant_id = p_tenant_id and l.id = p_recipient_id and l.deleted_at is null
                                       and (l.professional_id is not null or p_template_id = 'convite_propass'))
    when 'membership' then exists (select 1 from platform.membership m
                                   where m.tenant_id = p_tenant_id and m.id = p_recipient_id and m.deleted_at is null)
    when 'email_novo' then p_recipient_id is null and p_template_id = 'convite_equipe'
                           and num_nulls(p_id, p_address_enc, p_dek_wrapped, p_kek_version) = 0
    else false end;
  if not coalesce(v_ok, false) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'recipient';
  end if;

  insert into integrations.delivery (id, tenant_id, channel, template_id, recipient_kind, recipient_id,
                                     recipient_address_enc, recipient_dek_wrapped, recipient_kek_version, variables,
                                     idempotency_key, priority, next_attempt_at, valid_until, alternatives,
                                     reference_kind, reference_id, author)
  values (coalesce(p_id, gen_random_uuid()), p_tenant_id, p_channel, p_template_id, p_recipient_kind, p_recipient_id,
          p_address_enc, p_dek_wrapped, p_kek_version, p_variables, p_idempotency_key, coalesce(p_priority, 1),
          greatest(now(), coalesce(p_scheduled_for, now())), p_valid_until, coalesce(p_alternatives, '{}'),
          p_reference_kind, p_reference_id, p_author)
  on conflict (tenant_id, idempotency_key) do nothing
  returning id into v_id;
  if v_id is null then   -- repetido: devolve o que já existe (PDD §9.6, idempotência)
    select d.id into v_id from integrations.delivery d
    where d.tenant_id = p_tenant_id and d.idempotency_key = p_idempotency_key;
    return v_id;
  end if;
  perform private.delivery_log(v_id, p_tenant_id, 'pendente');
  return v_id;
end;
$$;

-- Reivindica até p_batch envios prontos (lease; FOR UPDATE SKIP LOCKED). Antes, expira o que passou da validade e apaga
-- o segredo do que ficou em 'enviado' por mais de 24 h sem retorno.
create function api.delivery_claim(p_batch int, p_lease_seconds int)
returns table (id uuid, tenant_id uuid, channel text, template_id text, recipient_kind text, recipient_id uuid,
               variables jsonb, idempotency_key text, attempt smallint, reference_kind text, reference_id uuid)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  r record;
begin
  if p_batch not between 1 and 100 or p_lease_seconds not between 5 and 900 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'claim';
  end if;
  for r in update integrations.delivery d set state = 'expirado', updated_at = now()
           where d.state in ('pendente', 'enviando') and d.valid_until <= now()
           returning d.id, d.tenant_id loop
    perform private.delivery_log(r.id, r.tenant_id, 'expirado');
    perform private.delivery_redact(r.id);
  end loop;
  for r in select d.id from integrations.delivery d
           where d.state = 'enviado' and d.updated_at < now() - interval '24 hours'
             and exists (select 1 from jsonb_each_text(d.variables) e where e.value <> '***')
           limit 200 loop
    perform private.delivery_redact(r.id);
  end loop;

  return query
  with ready as (
    select d.id from integrations.delivery d
    where d.state in ('pendente', 'enviando') and d.next_attempt_at <= now()
    order by d.priority, d.next_attempt_at
    limit p_batch
    for update skip locked
  )
  update integrations.delivery d
  set state = 'enviando', attempts = d.attempts + 1, next_attempt_at = now() + make_interval(secs => p_lease_seconds),
      updated_at = now()
  from ready where d.id = ready.id
  returning d.id, d.tenant_id, d.channel, d.template_id, d.recipient_kind, d.recipient_id, d.variables,
            d.idempotency_key, d.attempts, d.reference_kind, d.reference_id;
end;
$$;

-- O provedor aceitou: grava o id externo e o destino mascarado. Só vale para a tentativa reivindicada.
-- Link do Boarding Check: o primeiro envio aceito marca o grant (ADR 0004 §3, RN-FIC-07: os 8 h contam daqui).
create function api.delivery_mark_sent(p_id uuid, p_attempt smallint, p_external_id text, p_destination_masked text)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v integrations.delivery;
begin
  update integrations.delivery d
  set state = 'enviado', external_id = p_external_id, destination_masked = left(p_destination_masked, 60), updated_at = now()
  where d.id = p_id and d.state = 'enviando' and d.attempts = p_attempt
  returning d.* into v;
  if v.id is null then return false; end if;
  perform private.delivery_log(p_id, v.tenant_id, 'enviado');
  if v.template_id = 'link_boarding_check' and v.reference_kind = 'access_grant'
     and exists (select 1 from platform.access_grant g where g.id = v.reference_id and g.tenant_id = v.tenant_id
                   and g.purpose = 'professional_boarding' and g.sent_at is null and g.revoked_at is null) then
    perform api.grant_mark_sent(v.reference_id);
  end if;
  return true;
end;
$$;

-- Falha da tentativa: transitória volta à fila (5 s, 30 s, 5 min). Permanente, de configuração ou a 4ª tentativa vira
-- 'falhou' e aciona o canal alternativo (WhatsApp → SMS). Bloqueada no stage (ADR 0005 §1) vira 'bloqueado_stage', também
-- definitiva, mas SEM alternativo: o destino não está na lista de permitidos em canal nenhum.
-- Devolve 'reagendado', 'falhou', 'bloqueado_stage' ou 'ignorado'.
create function api.delivery_mark_failed(p_id uuid, p_attempt smallint, p_kind text, p_code text)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v integrations.delivery;
  v_waits interval[] := array[interval '5 seconds', interval '30 seconds', interval '5 minutes'];
  v_final text;
begin
  if p_kind not in ('transitoria', 'permanente', 'configuracao', 'bloqueado_stage') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'kind';
  end if;
  select * into v from integrations.delivery d where d.id = p_id and d.state = 'enviando' and d.attempts = p_attempt
  for update;
  if not found then return 'ignorado'; end if;   -- tentativa de outro worker (lease vencido)
  if p_kind = 'transitoria' and p_attempt < 4 then
    update integrations.delivery d set state = 'pendente', next_attempt_at = now() + v_waits[p_attempt],
      last_error_kind = p_kind, last_error_code = left(p_code, 60), updated_at = now() where d.id = p_id;
    perform private.delivery_log(p_id, v.tenant_id, 'reagendado', left(p_code, 60));
    return 'reagendado';
  end if;
  v_final := case when p_kind = 'bloqueado_stage' then 'bloqueado_stage' else 'falhou' end;
  update integrations.delivery d set state = v_final, last_error_kind = p_kind, last_error_code = left(p_code, 60),
    updated_at = now() where d.id = p_id;
  perform private.delivery_log(p_id, v.tenant_id, v_final, left(p_code, 60));
  if v_final = 'falhou' then perform private.delivery_enqueue_alternative(p_id); end if;
  perform private.delivery_redact(p_id);
  return v_final;
end;
$$;

-- Retorno do provedor (webhook): nunca regride, e uma reclamação não desfaz um entregue. 'falhou' aciona o alternativo.
create function api.delivery_apply_status(p_channel text, p_external_id text, p_state text, p_at timestamptz,
                                          p_code text default null, p_billable boolean default null)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v integrations.delivery;
  v_rank jsonb := '{"enviado": 2, "entregue": 3, "lido": 4}';
begin
  if p_state not in ('enviado', 'entregue', 'lido', 'falhou') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'state';
  end if;
  select * into v from integrations.delivery d where d.channel = p_channel and d.external_id = p_external_id for update;
  if not found then return null; end if;
  if (p_state = 'falhou' and v.state not in ('enviando', 'enviado'))
     or (p_state <> 'falhou' and (v.state not in ('enviando', 'enviado', 'entregue', 'lido')
                                  or (v_rank ->> p_state)::int <= coalesce((v_rank ->> v.state)::int, 0))) then
    return v.id;   -- atrasado, repetido ou depois do fim: não muda nada
  end if;
  update integrations.delivery d set state = p_state, updated_at = now(),
    billable = coalesce(p_billable, d.billable),
    last_error_code = case when p_state = 'falhou' then left(p_code, 60) else d.last_error_code end
  where d.id = v.id;
  perform private.delivery_log(v.id, v.tenant_id, p_state, left(p_code, 60), p_at);   -- a hora do provedor fica no evento
  if p_state = 'falhou' then perform private.delivery_enqueue_alternative(v.id); end if;
  if p_state in ('entregue', 'lido', 'falhou') then perform private.delivery_redact(v.id); end if;
  return v.id;
end;
$$;

create function api.delivery_cancel(p_tenant_id uuid, p_id uuid) returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
begin
  update integrations.delivery d set state = 'cancelado', updated_at = now()
  where d.id = p_id and d.tenant_id = p_tenant_id and d.state in ('pendente', 'enviando');
  if not found then return false; end if;
  perform private.delivery_log(p_id, p_tenant_id, 'cancelado');
  perform private.delivery_redact(p_id);
  return true;
end;
$$;

-- Webhook reentregue (Meta, Resend, Asaas): true na primeira vez, false nas seguintes.
create function api.webhook_first_time(p_provider text, p_event_id text) returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
begin
  insert into integrations.webhook_received (provider, event_id) values (p_provider, p_event_id)
  on conflict do nothing;
  return found;
end;
$$;

revoke all on function api.delivery_enqueue(uuid, text, text, text, uuid, jsonb, text, text, smallint, timestamptz,
  timestamptz, text[], text, uuid, uuid, bytea, bytea, smallint), api.delivery_claim(int, int),
  api.delivery_mark_sent(uuid, smallint, text, text), api.delivery_mark_failed(uuid, smallint, text, text),
  api.delivery_apply_status(text, text, text, timestamptz, text, boolean), api.delivery_cancel(uuid, uuid),
  api.webhook_first_time(text, text) from public, anon, authenticated;
grant execute on function api.delivery_enqueue(uuid, text, text, text, uuid, jsonb, text, text, smallint, timestamptz,
  timestamptz, text[], text, uuid, uuid, bytea, bytea, smallint), api.delivery_claim(int, int),
  api.delivery_mark_sent(uuid, smallint, text, text), api.delivery_mark_failed(uuid, smallint, text, text),
  api.delivery_apply_status(text, text, text, timestamptz, text, boolean), api.delivery_cancel(uuid, uuid),
  api.webhook_first_time(text, text) to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Histórico de envios para a clínica (destino mascarado, só o próprio tenant): Configurações, ou "Envios dos links"
-- de um atendimento para quem vê a agenda (§10.2.3)
-- ---------------------------------------------------------------------------------------------------------------
create function api.delivery_list(p_reference_kind text default null, p_reference_id uuid default null,
                                  p_limit int default 50, p_before timestamptz default null)
returns table (id uuid, channel text, template_id text, state text, attempts smallint, destination_masked text,
               last_error_code text, reference_kind text, reference_id uuid, author text, created_at timestamptz,
               updated_at timestamptz)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid := (select private.current_tenant_id());
begin
  if v_tenant is null
     or not (coalesce((select private.has_permission('settings', 'view')), false)
             or (p_reference_id is not null and p_reference_kind = 'appointment'
                 and coalesce((select private.has_permission('appointments', 'view')), false))) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if p_limit is null or p_limit not between 1 and 100 or num_nonnulls(p_reference_kind, p_reference_id) = 1 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'page';
  end if;
  return query
  select d.id, d.channel, d.template_id, d.state, d.attempts, d.destination_masked, d.last_error_code, d.reference_kind,
         d.reference_id, d.author, d.created_at, d.updated_at
  from integrations.delivery d
  where d.tenant_id = v_tenant
    and (p_reference_id is null or (d.reference_kind = p_reference_kind and d.reference_id = p_reference_id))
    and (p_before is null or d.created_at < p_before)
  order by d.created_at desc, d.id
  limit p_limit;
end;
$$;

revoke all on function api.delivery_list(text, uuid, int, timestamptz) from public, anon;
grant execute on function api.delivery_list(text, uuid, int, timestamptz) to authenticated;
