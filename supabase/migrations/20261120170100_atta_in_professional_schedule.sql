-- MIG-14a (parte 2): horários de atendimento e pausas do profissional na clínica (PDD v206 §10.4.3).
--
-- Agenda é do produto (atta_in; absorvida pelo Clinic/Pro, ADR 0001). Dias da semana (0 = domingo … 6 = sábado), ao
-- menos um dia, e o fim depois do início. Valem só para profissional com vínculo na clínica (FK composta para
-- platform.professional_tenant_link). O horário de funcionamento da clínica (RN-CFG-01) e as datas específicas entram
-- com a agenda (MIG-11), que soma tudo nos horários livres. Cada alteração vai para a auditoria, de quê para quê.

create table atta_in.professional_schedule (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  professional_id uuid not null,
  weekdays smallint[] not null,
  starts_at time not null,
  ends_at time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint professional_schedule_link_fk foreign key (tenant_id, professional_id)
    references platform.professional_tenant_link (tenant_id, professional_id),
  constraint professional_schedule_one_uq unique (tenant_id, professional_id),
  constraint professional_schedule_weekdays_check check (
    cardinality(weekdays) between 1 and 7 and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  constraint professional_schedule_window_check check (ends_at > starts_at)
);

create table atta_in.professional_break (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  professional_id uuid not null,
  weekdays smallint[] not null,
  starts_at time not null,
  ends_at time not null,
  created_at timestamptz not null default now(),
  constraint professional_break_link_fk foreign key (tenant_id, professional_id)
    references platform.professional_tenant_link (tenant_id, professional_id),
  constraint professional_break_weekdays_check check (
    cardinality(weekdays) between 1 and 7 and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  constraint professional_break_window_check check (ends_at > starts_at)
);
create index professional_break_tenant_idx on atta_in.professional_break (tenant_id, professional_id);

alter table atta_in.professional_schedule enable row level security;
alter table atta_in.professional_schedule force row level security;
alter table atta_in.professional_break enable row level security;
alter table atta_in.professional_break force row level security;
revoke all on atta_in.professional_schedule, atta_in.professional_break from public, anon, authenticated;
grant select, insert, update, delete on atta_in.professional_schedule, atta_in.professional_break to authenticated;

-- ver: quem vê a agenda ou a equipe; mudar: só quem edita a equipe (ADMIN)
create policy professional_schedule_select on atta_in.professional_schedule for select to authenticated
  using (tenant_id = (select private.current_tenant_id())
         and ((select private.has_permission('appointments', 'view')) or (select private.has_permission('team', 'view'))));
create policy professional_schedule_write on atta_in.professional_schedule for all to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('team', 'edit')))
  with check (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('team', 'edit')));
create policy professional_break_select on atta_in.professional_break for select to authenticated
  using (tenant_id = (select private.current_tenant_id())
         and ((select private.has_permission('appointments', 'view')) or (select private.has_permission('team', 'view'))));
create policy professional_break_write on atta_in.professional_break for all to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('team', 'edit')))
  with check (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('team', 'edit')));

-- auditoria de cada alteração, de quê para quê (ADR 0003: kind change, before/after só do que importa)
insert into audit.action (action, kind) values
  ('professional_schedule.change', 'change'),
  ('professional_break.change', 'change')
on conflict (action) do nothing;

create function atta_in.audit_professional_hours() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE')
                      then jsonb_build_object('weekdays', old.weekdays, 'starts_at', old.starts_at, 'ends_at', old.ends_at)
                 end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE')
                      then jsonb_build_object('weekdays', new.weekdays, 'starts_at', new.starts_at, 'ends_at', new.ends_at)
                 end;
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  perform audit.record_event(
    case tg_table_name when 'professional_schedule' then 'professional_schedule.change'
                       else 'professional_break.change' end,
    'atta_in.' || tg_table_name,
    coalesce(new.professional_id, old.professional_id),
    jsonb_build_object('op', lower(tg_op)),
    coalesce(v_old, '{}'::jsonb), coalesce(v_new, '{}'::jsonb));
  return coalesce(new, old);
end;
$$;
revoke all on function atta_in.audit_professional_hours() from public, anon, authenticated;

create trigger professional_schedule_audit before insert or update or delete on atta_in.professional_schedule
  for each row execute function atta_in.audit_professional_hours();
create trigger professional_break_audit before insert or update or delete on atta_in.professional_break
  for each row execute function atta_in.audit_professional_hours();
