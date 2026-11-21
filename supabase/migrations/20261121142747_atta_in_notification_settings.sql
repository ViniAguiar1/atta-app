-- MIG-15 (parte 1): Configurações › Notificações, a configuração por clínica (PDD v206 §10.4.6 e §21; decisão R33 do
-- CTO; contrato aprovado pelo Tech Lead em desenho/mig-15-notificacoes-contrato.md). O disparo dos avisos vem depois.
--   - Canais externos: E-mail e WhatsApp, cada um com toggle e o endereço da equipe. O sino de Atividades é sempre ativo
--     e não é configurável (§10.4.6), então não está aqui.
--   - 10 eventos em 3 categorias (§10.4.6), cada um com E-mail e WhatsApp. A marcação fica guardada com o canal
--     desligado (a tela desabilita a coluna).
--   - Filtros: pausa noturna (22h às 07h) e frequência do resumo (tempo real, diário ou semanal).
--   - Só o ADMIN (Configurações é exclusiva do gestor, §10.4.3): settings view para ler e edit para gravar, no banco.
--   - O e-mail e o número da equipe são dado pessoal: cifrados pelo envelope (ADR 0002 §6, Cofre 'network'; DEK com
--     (tenant, 'atta_in.notification_channel', 'dek', envelope_id)), mais a máscara. A leitura devolve só a máscara.
--     O formato é validado no servidor antes de cifrar (src/server/notificacoes/canal.ts). O banco confere o que vê.
--   - Padrão de clínica nova: o PDD é omisso. Fica tudo desligado (Tech Lead), e a pergunta foi ao CTO.
--   - Trilha notification.settings_update só com o canal, a chave do evento ou o nome do filtro, nunca o endereço.

-- catálogo fechado, na ordem da tela (§10.4.6); a chave é estável e o rótulo fica no textos.ts
create function atta_in.notification_events()
returns table (key text, category text, ord smallint)
language sql immutable set search_path = ''
as $$
  values ('checkin_iniciado', 'checkin_atendimentos', 1::smallint),
         ('checkin_concluido', 'checkin_atendimentos', 2::smallint),
         ('documento_assinado', 'checkin_atendimentos', 3::smallint),
         ('paciente_atrasado', 'checkin_atendimentos', 4::smallint),
         ('atendimento_sem_documento', 'checkin_atendimentos', 5::smallint),
         ('novo_modelo', 'documentos_modelos', 6::smallint),
         ('documento_vencendo', 'documentos_modelos', 7::smallint),
         ('documentos_procedimento_atualizados', 'documentos_modelos', 8::smallint),
         ('membro_convidado', 'sistema_conta', 9::smallint),
         ('limite_documentos_90', 'sistema_conta', 10::smallint)
$$;
-- só as funções api.* abaixo leem o catálogo (a tela recebe os eventos pelo notification_settings_get)
revoke all on function atta_in.notification_events() from public, anon, authenticated;

create table atta_in.notification_channel (
  tenant_id uuid not null references platform.tenant (id) on delete cascade,
  channel text not null,
  active boolean not null default false,
  address_enc bytea,
  address_masked text,
  envelope_id uuid,
  dek_wrapped bytea,
  kek_version smallint,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (tenant_id, channel),
  constraint notification_channel_channel_check check (channel in ('email', 'whatsapp')),
  -- o envelope vem inteiro ou não vem
  constraint notification_channel_envelope_check
    check (num_nulls(address_enc, address_masked, envelope_id, dek_wrapped, kek_version) in (0, 5)),
  -- canal ligado tem endereço
  constraint notification_channel_active_check check (not active or address_enc is not null),
  -- só a máscara é legível: e-mail "re•••@cl•••.com.br"; celular "(11) •••••-••01"
  constraint notification_channel_masked_check check (address_masked is null
    or (channel = 'email' and address_masked ~ '^[^[:space:]@•]{1,2}•••@[^[:space:]@•.]{1,2}•••(\.[^[:space:]@•.]+)+$')
    or (channel = 'whatsapp' and address_masked ~ '^\(\d{2}\) •••••-••\d{2}$'))
);

create table atta_in.notification_preference (
  tenant_id uuid not null references platform.tenant (id) on delete cascade,
  event_key text not null,
  channel text not null,
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (tenant_id, event_key, channel),
  constraint notification_preference_channel_check check (channel in ('email', 'whatsapp')),
  constraint notification_preference_event_check check (event_key in (
    'checkin_iniciado', 'checkin_concluido', 'documento_assinado', 'paciente_atrasado', 'atendimento_sem_documento',
    'novo_modelo', 'documento_vencendo', 'documentos_procedimento_atualizados', 'membro_convidado',
    'limite_documentos_90'))
);

create table atta_in.notification_filter (
  tenant_id uuid primary key references platform.tenant (id) on delete cascade,
  pausa_noturna boolean not null default false,
  frequencia_resumo text not null default 'tempo_real',
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint notification_filter_frequencia_check check (frequencia_resumo in ('tempo_real', 'diario', 'semanal'))
);

-- RLS forçada: a tela não lê nem grava direto (só pelas funções abaixo); o ADMIN da própria clínica vê as linhas dela
alter table atta_in.notification_channel enable row level security;
alter table atta_in.notification_channel force row level security;
alter table atta_in.notification_preference enable row level security;
alter table atta_in.notification_preference force row level security;
alter table atta_in.notification_filter enable row level security;
alter table atta_in.notification_filter force row level security;
revoke all on atta_in.notification_channel, atta_in.notification_preference, atta_in.notification_filter
  from public, anon, authenticated;
grant select on atta_in.notification_preference, atta_in.notification_filter to authenticated;
grant select (tenant_id, channel, active, address_masked, updated_at) on atta_in.notification_channel to authenticated;
create policy notification_channel_select on atta_in.notification_channel for select to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('settings', 'view')));
create policy notification_preference_select on atta_in.notification_preference for select to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('settings', 'view')));
create policy notification_filter_select on atta_in.notification_filter for select to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('settings', 'view')));

insert into audit.action (action, kind) values ('notification.settings_update', 'change') on conflict (action) do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- Leitura: canais só mascarados, os 10 eventos sempre (os sem linha vêm desmarcados) e os filtros
-- ---------------------------------------------------------------------------------------------------------------
create function api.notification_settings_get() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
begin
  if v_tenant is null or not coalesce((select private.has_permission('settings', 'view')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  return jsonb_build_object(
    'channels', (select jsonb_object_agg(c.channel, jsonb_build_object('active', coalesce(n.active, false),
                                                                        'masked', n.address_masked))
                 from (values ('email'), ('whatsapp')) c (channel)
                 left join atta_in.notification_channel n on n.tenant_id = v_tenant and n.channel = c.channel),
    'events', (select jsonb_agg(jsonb_build_object(
                        'key', e.key, 'category', e.category,
                        'email', coalesce((select p.enabled from atta_in.notification_preference p
                                           where p.tenant_id = v_tenant and p.event_key = e.key and p.channel = 'email'), false),
                        'whatsapp', coalesce((select p.enabled from atta_in.notification_preference p
                                              where p.tenant_id = v_tenant and p.event_key = e.key and p.channel = 'whatsapp'), false))
                      order by e.ord)
               from atta_in.notification_events() e),
    'filters', (select jsonb_build_object('pausa_noturna', coalesce(f.pausa_noturna, false),
                                          'frequencia_resumo', coalesce(f.frequencia_resumo, 'tempo_real'))
                from (select 1) x left join atta_in.notification_filter f on f.tenant_id = v_tenant));
end;
$$;
revoke all on function api.notification_settings_get() from public, anon;
grant execute on function api.notification_settings_get() to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Canal: liga e desliga; trocar o endereço manda o envelope inteiro (endereço nulo = mantém o atual)
-- ---------------------------------------------------------------------------------------------------------------
create function api.notification_channel_set(
  p_channel text,
  p_active boolean,
  p_address_enc bytea default null,
  p_address_masked text default null,
  p_envelope_id uuid default null,
  p_dek_wrapped bytea default null,
  p_kek_version smallint default null
) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_troca boolean := num_nonnulls(p_address_enc, p_address_masked, p_envelope_id, p_dek_wrapped, p_kek_version) > 0;
  v_tem_endereco boolean;
begin
  if v_tenant is null or not coalesce((select private.has_permission('settings', 'edit')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if p_channel is null or p_channel not in ('email', 'whatsapp') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'channel';
  end if;
  if p_active is null then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'active';
  end if;
  if v_troca and (num_nulls(p_address_enc, p_address_masked, p_envelope_id, p_dek_wrapped, p_kek_version) > 0
                  or octet_length(p_address_enc) < 29 or octet_length(p_dek_wrapped) < 29 or p_kek_version < 1
                  or not ((p_channel = 'email' and p_address_masked ~ '^[^[:space:]@•]{1,2}•••@[^[:space:]@•.]{1,2}•••(\.[^[:space:]@•.]+)+$')
                          or (p_channel = 'whatsapp' and p_address_masked ~ '^\(\d{2}\) •••••-••\d{2}$'))) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'address';
  end if;
  -- o campo do endereço só edita com o canal ligado (simulador: "Ligue o canal para editar"; Tech Lead e #286):
  -- endereço novo numa chamada que deixa o canal desligado é recusado
  if v_troca and not p_active then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'estado';
  end if;
  v_tem_endereco := v_troca or exists (select 1 from atta_in.notification_channel n
                                       where n.tenant_id = v_tenant and n.channel = p_channel and n.address_enc is not null);
  if p_active and not v_tem_endereco then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'address';
  end if;

  -- update e, se não houver linha, insert (o CHECK do canal ligado vale na linha do insert antes do on conflict)
  update atta_in.notification_channel n set
    active = p_active,
    address_enc = case when v_troca then p_address_enc else n.address_enc end,
    address_masked = case when v_troca then p_address_masked else n.address_masked end,
    envelope_id = case when v_troca then p_envelope_id else n.envelope_id end,
    dek_wrapped = case when v_troca then p_dek_wrapped else n.dek_wrapped end,
    kek_version = case when v_troca then p_kek_version else n.kek_version end,
    updated_at = now(), updated_by = auth.uid()
  where n.tenant_id = v_tenant and n.channel = p_channel;
  if not found then
    insert into atta_in.notification_channel (tenant_id, channel, active, address_enc, address_masked, envelope_id,
                                              dek_wrapped, kek_version)
    values (v_tenant, p_channel, p_active, p_address_enc, p_address_masked, p_envelope_id, p_dek_wrapped, p_kek_version);
  end if;

  perform audit.record_event('notification.settings_update', 'atta_in.notification_channel', null,
    jsonb_build_object('channel', p_channel, 'active', p_active, 'address_changed', v_troca));
end;
$$;
revoke all on function api.notification_channel_set(text, boolean, bytea, text, uuid, bytea, smallint) from public, anon;
grant execute on function api.notification_channel_set(text, boolean, bytea, text, uuid, bytea, smallint) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Evento × canal: fica guardado mesmo com o canal desligado
-- ---------------------------------------------------------------------------------------------------------------
create function api.notification_event_set(p_event_key text, p_channel text, p_enabled boolean) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
begin
  if v_tenant is null or not coalesce((select private.has_permission('settings', 'edit')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if p_event_key is null or not exists (select 1 from atta_in.notification_events() e where e.key = p_event_key) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'event_key';
  end if;
  if p_channel is null or p_channel not in ('email', 'whatsapp') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'channel';
  end if;
  if p_enabled is null then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'enabled';
  end if;
  insert into atta_in.notification_preference as p (tenant_id, event_key, channel, enabled)
  values (v_tenant, p_event_key, p_channel, p_enabled)
  on conflict (tenant_id, event_key, channel) do update set enabled = excluded.enabled, updated_at = now(),
                                                            updated_by = auth.uid();
  perform audit.record_event('notification.settings_update', 'atta_in.notification_preference', null,
    jsonb_build_object('event_key', p_event_key, 'channel', p_channel, 'enabled', p_enabled));
end;
$$;
revoke all on function api.notification_event_set(text, text, boolean) from public, anon;
grant execute on function api.notification_event_set(text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Filtros de produtividade & silêncio (§10.4.6): pausa noturna e frequência do resumo
-- ---------------------------------------------------------------------------------------------------------------
create function api.notification_filters_set(p_pausa_noturna boolean, p_frequencia_resumo text) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
begin
  if v_tenant is null or not coalesce((select private.has_permission('settings', 'edit')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if p_pausa_noturna is null then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'pausa_noturna';
  end if;
  if p_frequencia_resumo is null or p_frequencia_resumo not in ('tempo_real', 'diario', 'semanal') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'frequencia_resumo';
  end if;
  insert into atta_in.notification_filter as f (tenant_id, pausa_noturna, frequencia_resumo)
  values (v_tenant, p_pausa_noturna, p_frequencia_resumo)
  on conflict (tenant_id) do update set pausa_noturna = excluded.pausa_noturna,
                                        frequencia_resumo = excluded.frequencia_resumo,
                                        updated_at = now(), updated_by = auth.uid();
  perform audit.record_event('notification.settings_update', 'atta_in.notification_filter', null,
    jsonb_build_object('filters', jsonb_build_array('pausa_noturna', 'frequencia_resumo'),
                       'pausa_noturna', p_pausa_noturna, 'frequencia_resumo', p_frequencia_resumo));
end;
$$;
revoke all on function api.notification_filters_set(boolean, text) from public, anon;
grant execute on function api.notification_filters_set(boolean, text) to authenticated;
