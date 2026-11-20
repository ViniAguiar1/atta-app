-- MIG-11 (parte a): o que a agenda precisa antes do agendamento. Horário de funcionamento da clínica (RN-CFG-01),
-- catálogo de Serviços (PDD v206 §10.4.7), Serviços autorizados por profissional (§10.4.3) e datas específicas (§10.2.2:
-- lembrete, clínica fechada ou profissional ausente). Tudo por clínica, com RLS forçada; os horários livres somam isso
-- tudo na parte b. Quem muda: Configurações (ADMIN) para horário e Serviços; Equipe (ADMIN) para Serviços autorizados;
-- a agenda (quem edita agendamentos) para as datas específicas, que vão para a auditoria.

-- ---------------------------------------------------------------------------------------------------------------
-- Horário de funcionamento: uma ou mais janelas por dia da semana (0 = domingo … 6 = sábado)
-- ---------------------------------------------------------------------------------------------------------------
create table atta_in.business_hours (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenant (id),
  weekday smallint not null,
  starts_at time not null,
  ends_at time not null,
  created_at timestamptz not null default now(),
  constraint business_hours_weekday_check check (weekday between 0 and 6),
  constraint business_hours_window_check check (ends_at > starts_at),
  constraint business_hours_uq unique (tenant_id, weekday, starts_at)
);

-- ---------------------------------------------------------------------------------------------------------------
-- Catálogo de Serviços da clínica
-- ---------------------------------------------------------------------------------------------------------------
create table atta_in.clinic_service (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenant (id),
  name text not null,
  category text,
  duration_min integer not null,
  requires_rt boolean not null default false,          -- "Exige RT" (§10.4.7)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint clinic_service_name_check check (length(btrim(name)) between 2 and 120),
  constraint clinic_service_duration_check check (duration_min between 5 and 480),
  constraint clinic_service_tenant_id_uq unique (tenant_id, id)       -- alvo das FKs compostas
);
create unique index clinic_service_name_uq on atta_in.clinic_service (tenant_id, lower(btrim(name)))
  where deleted_at is null;

-- a exceção de configuração por Serviço (MIG-10) passa a apontar para um Serviço da mesma clínica
alter table atta_in.setting add constraint setting_clinic_service_fk
  foreign key (tenant_id, clinic_service_id) references atta_in.clinic_service (tenant_id, id);

-- ---------------------------------------------------------------------------------------------------------------
-- Serviços autorizados por profissional (pelo vínculo com a clínica, que nasce no convite; Serviço da mesma clínica)
-- ---------------------------------------------------------------------------------------------------------------
create table atta_in.professional_service (
  tenant_id uuid not null,
  professional_link_id uuid not null,
  clinic_service_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, professional_link_id, clinic_service_id),
  constraint professional_service_link_fk foreign key (tenant_id, professional_link_id)
    references platform.professional_tenant_link (tenant_id, id),
  constraint professional_service_service_fk foreign key (tenant_id, clinic_service_id)
    references atta_in.clinic_service (tenant_id, id)
);

-- ---------------------------------------------------------------------------------------------------------------
-- Datas específicas: lembrete, clínica fechada ou profissional ausente, num dia ou num período
-- ---------------------------------------------------------------------------------------------------------------
create table atta_in.special_date (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenant (id),
  starts_on date not null,
  ends_on date not null,
  name text not null,
  kind text not null,
  professional_link_id uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint special_date_period_check check (ends_on >= starts_on),
  constraint special_date_name_check check (length(btrim(name)) between 1 and 40),
  constraint special_date_kind_check check (kind in ('lembrete', 'clinica_fechada', 'profissional_ausente')),
  constraint special_date_professional_check check ((kind = 'profissional_ausente') = (professional_link_id is not null)),
  constraint special_date_link_fk foreign key (tenant_id, professional_link_id)
    references platform.professional_tenant_link (tenant_id, id)
);
create index special_date_tenant_idx on atta_in.special_date (tenant_id, starts_on, ends_on);

-- ---------------------------------------------------------------------------------------------------------------
-- RLS forçada e grants mínimos
-- ---------------------------------------------------------------------------------------------------------------
alter table atta_in.business_hours enable row level security;
alter table atta_in.business_hours force row level security;
alter table atta_in.clinic_service enable row level security;
alter table atta_in.clinic_service force row level security;
alter table atta_in.professional_service enable row level security;
alter table atta_in.professional_service force row level security;
alter table atta_in.special_date enable row level security;
alter table atta_in.special_date force row level security;

revoke all on atta_in.business_hours, atta_in.clinic_service, atta_in.professional_service, atta_in.special_date
  from public, anon, authenticated;
grant select, insert, update, delete on atta_in.business_hours, atta_in.professional_service, atta_in.special_date
  to authenticated;
grant select, insert, update on atta_in.clinic_service to authenticated;   -- Serviço sai por exclusão lógica

create policy business_hours_select on atta_in.business_hours for select to authenticated
  using (tenant_id = (select private.current_tenant_id())
         and ((select private.has_permission('appointments', 'view')) or (select private.has_permission('settings', 'view'))));
create policy business_hours_write on atta_in.business_hours for all to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('settings', 'edit')))
  with check (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('settings', 'edit')));

create policy clinic_service_select on atta_in.clinic_service for select to authenticated
  using (tenant_id = (select private.current_tenant_id())
         and ((select private.has_permission('appointments', 'view')) or (select private.has_permission('settings', 'view'))));
create policy clinic_service_write on atta_in.clinic_service for all to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('settings', 'edit')))
  with check (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('settings', 'edit')));

create policy professional_service_select on atta_in.professional_service for select to authenticated
  using (tenant_id = (select private.current_tenant_id())
         and ((select private.has_permission('appointments', 'view')) or (select private.has_permission('team', 'view'))));
create policy professional_service_write on atta_in.professional_service for all to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('team', 'edit')))
  with check (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('team', 'edit')));

create policy special_date_select on atta_in.special_date for select to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('appointments', 'view')));
create policy special_date_write on atta_in.special_date for all to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('appointments', 'edit')))
  with check (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('appointments', 'edit')));

-- a criação e a remoção de data específica vão para a auditoria (§10.2.2)
insert into audit.action (action, kind) values ('special_date.change', 'change') on conflict (action) do nothing;

create function atta_in.audit_special_date() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform audit.record_event('special_date.change', 'atta_in.special_date', coalesce(new.id, old.id),
    jsonb_build_object('op', lower(tg_op)),
    case when tg_op = 'DELETE' then jsonb_build_object('kind', old.kind, 'starts_on', old.starts_on,
                                                       'ends_on', old.ends_on) else '{}'::jsonb end,
    case when tg_op = 'INSERT' then jsonb_build_object('kind', new.kind, 'starts_on', new.starts_on,
                                                       'ends_on', new.ends_on) else '{}'::jsonb end);
  return coalesce(new, old);
end;
$$;
revoke all on function atta_in.audit_special_date() from public, anon, authenticated;
create trigger special_date_audit after insert or delete on atta_in.special_date
  for each row execute function atta_in.audit_special_date();
