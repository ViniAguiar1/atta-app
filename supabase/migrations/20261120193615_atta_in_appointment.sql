-- MIG-11b: agendamento, os 7 estados e as regras que o banco garante (PDD v206 §10.2.1 e §10.2.2).
--
-- Paciente pela ADR 0005 §4: pessoa da rede (person_id, com vínculo na clínica) OU paciente provisório da importação
-- (provisional_patient_id), exatamente um. Profissional pelo vínculo com a clínica (ADR 0001 §1), e só com o PROpass
-- concluído e o vínculo vivo (PDD §10.4.3: o profissional é cadastrado pelo convite e completa o PROpass).
-- O banco recusa (P0001 ATTA-IN-0003, a regra no detail; ADR 0001 §5):
--   - professional_link_id: profissional sem PROpass concluído ou com o vínculo excluído;
--   - starts_at: dia de clínica fechada ou de profissional ausente (data específica, §10.2.2);
--   - return_of_appointment_id: Retorno com origem que não está Concluída ou não é anterior (RN-AGN-TIPO-02); de outro
--     paciente ou de outra clínica a FK composta recusa;
--   - clinic_service_id: Serviço que o profissional não tem autorizado (§10.4.3);
--   - status: transição que a tabela do §10.2.2 não permite; absent_day: Ausente fora do dia do atendimento;
--   - business_hours: horário do profissional fora do horário de funcionamento (RN-CFG-01).
-- Procedimento online e Retorno sem origem são recusados por CHECK (RN-AGN-TIPO-02 e -04).
-- Encaixe (o mesmo profissional em horários sobrepostos): SEM restrição aqui. O PDD §10.2.1 permite com confirmação
-- ("Horário já ocupado para este profissional", PO 18/11), contra a decisão do PLANO; está com o CTO (Regra nº 1).
-- Se a resposta for recusar, a restrição de exclusão vem numa migration separada.
-- Status só muda por função (o UPDATE da coluna não é concedido). Os passos que o paciente e o profissional disparam
-- (em_preenchimento, pronto, em_atendimento) e a ausência automática chegam com o check-in (MIG-13) e o Boarding Check,
-- pela função interna atta_in.apply_transition.

-- o provisório passa a ser alvo de FK composta com a clínica (o agendamento nunca aponta para provisório de outra)
alter table network.person_import_provisional
  add constraint person_import_provisional_tenant_id_uq unique (tenant_id, id);

create table atta_in.appointment (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenant (id),
  person_id uuid,
  provisional_patient_id uuid,
  professional_link_id uuid not null,
  appointment_type text not null,
  modality text not null default 'presencial',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'agendado',
  return_of_appointment_id uuid,
  cancel_reason text,
  absent_mode text,
  concluded_by_reception boolean not null default false,
  checkin_started_at timestamptz,
  ready_at timestamptz,
  in_service_at timestamptz,
  concluded_at timestamptz,
  absent_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_patient_check check (num_nonnulls(person_id, provisional_patient_id) = 1),
  constraint appointment_person_link_fk foreign key (tenant_id, person_id)
    references network.person_tenant_link (tenant_id, person_id),
  constraint appointment_provisional_fk foreign key (tenant_id, provisional_patient_id)
    references network.person_import_provisional (tenant_id, id),
  constraint appointment_professional_link_fk foreign key (tenant_id, professional_link_id)
    references platform.professional_tenant_link (tenant_id, id),
  constraint appointment_type_check check (appointment_type in ('consulta', 'avaliacao', 'procedimento', 'retorno')),
  constraint appointment_modality_check check (modality in ('presencial', 'online')),
  constraint appointment_procedure_presencial_check check (not (appointment_type = 'procedimento' and modality = 'online')),
  constraint appointment_window_check check (ends_at > starts_at and ends_at <= starts_at + interval '8 hours'),
  constraint appointment_status_check check (status in
    ('agendado', 'em_preenchimento', 'pronto', 'em_atendimento', 'concluido', 'ausente', 'cancelado')),
  -- Retorno exige origem e paciente da rede (a origem foi concluída, então o paciente já passou pelo check-in)
  constraint appointment_return_check check (
    (appointment_type = 'retorno') = (return_of_appointment_id is not null)
    and (return_of_appointment_id is null or person_id is not null)),
  constraint appointment_absent_mode_check check (absent_mode in ('manual', 'automatico')),
  constraint appointment_cancel_reason_check check ((status = 'cancelado') = (cancel_reason is not null)),
  constraint appointment_tenant_person_id_uq unique (tenant_id, person_id, id),
  constraint appointment_tenant_id_uq unique (tenant_id, id),
  constraint appointment_return_fk foreign key (tenant_id, person_id, return_of_appointment_id)
    references atta_in.appointment (tenant_id, person_id, id)
);
create index appointment_tenant_starts_idx on atta_in.appointment (tenant_id, starts_at);
create index appointment_tenant_professional_idx on atta_in.appointment (tenant_id, professional_link_id, starts_at);
create index appointment_tenant_person_idx on atta_in.appointment (tenant_id, person_id, starts_at desc);
create index appointment_tenant_provisional_idx on atta_in.appointment (tenant_id, provisional_patient_id)
  where provisional_patient_id is not null;

create table atta_in.appointment_clinic_service (
  tenant_id uuid not null,
  appointment_id uuid not null,
  clinic_service_id uuid not null,
  primary key (tenant_id, appointment_id, clinic_service_id),
  constraint appointment_clinic_service_appointment_fk foreign key (tenant_id, appointment_id)
    references atta_in.appointment (tenant_id, id) on delete cascade,
  constraint appointment_clinic_service_service_fk foreign key (tenant_id, clinic_service_id)
    references atta_in.clinic_service (tenant_id, id)
);

create table atta_in.appointment_transition (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  appointment_id uuid not null,
  from_status text not null,
  to_status text not null,
  reason text,
  actor uuid default auth.uid(),
  at timestamptz not null default now(),
  constraint appointment_transition_appointment_fk foreign key (tenant_id, appointment_id)
    references atta_in.appointment (tenant_id, id)
);
create index appointment_transition_tenant_idx on atta_in.appointment_transition (tenant_id, appointment_id, at);

-- ---------------------------------------------------------------------------------------------------------------
-- Regras que dependem de outras tabelas (gatilhos; valem para qualquer caminho de escrita)
-- ---------------------------------------------------------------------------------------------------------------
create function atta_in.appointment_validate() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_tz text;
  v_day date;
  v_origin record;
begin
  if tg_op = 'INSERT' and new.status <> 'agendado' then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'status';
  end if;
  if not exists (select 1 from platform.professional_tenant_link l
                 where l.tenant_id = new.tenant_id and l.id = new.professional_link_id
                   and l.deleted_at is null and l.propass_completed_at is not null) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'professional_link_id';
  end if;
  select t.timezone into v_tz from platform.tenant t where t.id = new.tenant_id;
  v_day := (new.starts_at at time zone v_tz)::date;
  if exists (select 1 from atta_in.special_date d
             where d.tenant_id = new.tenant_id and v_day between d.starts_on and d.ends_on
               and (d.kind = 'clinica_fechada'
                    or (d.kind = 'profissional_ausente' and d.professional_link_id = new.professional_link_id))) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'starts_at';
  end if;
  if new.return_of_appointment_id is not null then
    select a.status, a.starts_at into v_origin from atta_in.appointment a
    where a.tenant_id = new.tenant_id and a.id = new.return_of_appointment_id;
    if v_origin.status is distinct from 'concluido' or v_origin.starts_at >= new.starts_at then
      raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'return_of_appointment_id';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function atta_in.appointment_validate() from public, anon, authenticated;
create trigger appointment_validate before insert or update of starts_at, ends_at, professional_link_id,
  return_of_appointment_id on atta_in.appointment for each row execute function atta_in.appointment_validate();

create function atta_in.appointment_service_validate() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from atta_in.appointment a
                 join atta_in.professional_service ps
                   on ps.tenant_id = a.tenant_id and ps.professional_link_id = a.professional_link_id
                  and ps.clinic_service_id = new.clinic_service_id
                 where a.tenant_id = new.tenant_id and a.id = new.appointment_id) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'clinic_service_id';
  end if;
  return new;
end;
$$;
revoke all on function atta_in.appointment_service_validate() from public, anon, authenticated;
create trigger appointment_service_validate before insert on atta_in.appointment_clinic_service
  for each row execute function atta_in.appointment_service_validate();

-- RN-CFG-01: o horário do profissional só vale dentro do horário de funcionamento. Cada dia do horário precisa caber
-- numa janela de funcionamento do mesmo dia. Clínica ainda sem nenhum horário de funcionamento (onboarding) não trava.
create function atta_in.professional_schedule_within_business_hours() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_day smallint;
begin
  if not exists (select 1 from atta_in.business_hours b where b.tenant_id = new.tenant_id) then
    return new;
  end if;
  foreach v_day in array new.weekdays loop
    if not exists (select 1 from atta_in.business_hours b
                   where b.tenant_id = new.tenant_id and b.weekday = v_day
                     and b.starts_at <= new.starts_at and b.ends_at >= new.ends_at) then
      raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'business_hours';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function atta_in.professional_schedule_within_business_hours() from public, anon, authenticated;
create trigger professional_schedule_within_business_hours before insert or update of weekdays, starts_at, ends_at
  on atta_in.professional_schedule for each row execute function atta_in.professional_schedule_within_business_hours();

-- ---------------------------------------------------------------------------------------------------------------
-- Máquina de estados (tabela do PDD §10.2.2)
-- ---------------------------------------------------------------------------------------------------------------
insert into audit.action (action, kind) values
  ('appointment.create', 'change'),
  ('appointment.transition', 'change')
on conflict (action) do nothing;

create function atta_in.audit_appointment_create() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform audit.record_event('appointment.create', 'atta_in.appointment', new.id,
    jsonb_build_object('appointment_type', new.appointment_type, 'modality', new.modality), null,
    jsonb_build_object('starts_at', new.starts_at, 'ends_at', new.ends_at,
                       'professional_link_id', new.professional_link_id), new.tenant_id);
  return new;
end;
$$;
revoke all on function atta_in.audit_appointment_create() from public, anon, authenticated;
create trigger appointment_audit_create after insert on atta_in.appointment
  for each row execute function atta_in.audit_appointment_create();

-- interna: aplica uma transição permitida; quem pode pedir qual transição é decidido por quem a chama
create function atta_in.apply_transition(p_id uuid, p_tenant uuid, p_to text, p_reason text default null,
                                         p_by_reception boolean default false, p_absent_mode text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_from text;
  v_allowed text[];
begin
  select a.status into v_from from atta_in.appointment a where a.tenant_id = p_tenant and a.id = p_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'appointment_id';
  end if;
  v_allowed := case v_from
    when 'agendado' then array['em_preenchimento', 'ausente', 'cancelado']
    when 'em_preenchimento' then array['pronto', 'cancelado']
    when 'pronto' then array['em_atendimento', 'concluido', 'cancelado']
    when 'em_atendimento' then array['concluido', 'cancelado']
    when 'ausente' then array['cancelado']
    else array[]::text[] end;
  if not p_to = any (v_allowed) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'status';
  end if;
  if p_to = 'cancelado' and (p_reason is null or length(btrim(p_reason)) < 3) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'reason';
  end if;

  update atta_in.appointment a set
    status = p_to,
    checkin_started_at = case when p_to = 'em_preenchimento' then now() else a.checkin_started_at end,
    ready_at = case when p_to = 'pronto' then now() else a.ready_at end,
    in_service_at = case when p_to = 'em_atendimento' then now() else a.in_service_at end,
    concluded_at = case when p_to = 'concluido' then now() else a.concluded_at end,
    concluded_by_reception = case when p_to = 'concluido' then p_by_reception else a.concluded_by_reception end,
    absent_at = case when p_to = 'ausente' then now() else a.absent_at end,
    absent_mode = case when p_to = 'ausente' then p_absent_mode else a.absent_mode end,
    cancelled_at = case when p_to = 'cancelado' then now() else a.cancelled_at end,
    cancel_reason = case when p_to = 'cancelado' then btrim(p_reason) else a.cancel_reason end,
    updated_at = now()
  where a.tenant_id = p_tenant and a.id = p_id;

  insert into atta_in.appointment_transition (tenant_id, appointment_id, from_status, to_status, reason)
  values (p_tenant, p_id, v_from, p_to, nullif(btrim(coalesce(p_reason, '')), ''));
  -- o motivo fica na tabela de transições (lida com RLS); na trilha, só os estados e quem concluiu
  perform audit.record_event('appointment.transition', 'atta_in.appointment', p_id,
    jsonb_build_object('by_reception', p_by_reception, 'has_reason', p_reason is not null),
    jsonb_build_object('status', v_from), jsonb_build_object('status', p_to), p_tenant);
end;
$$;
revoke all on function atta_in.apply_transition(uuid, uuid, text, text, boolean, text) from public, anon, authenticated;

-- a da recepção: marcar Ausente (só no dia do atendimento), cancelar com motivo e "Concluir pela recepção"
create function atta_in.transition_appointment(p_id uuid, p_to text, p_reason text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_starts timestamptz;
  v_tz text;
begin
  if v_tenant is null or not coalesce((select private.has_permission('appointments', 'edit')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if p_to not in ('ausente', 'cancelado', 'concluido') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'status';   -- os outros vêm dos fluxos
  end if;
  select a.starts_at, t.timezone into v_starts, v_tz
  from atta_in.appointment a join platform.tenant t on t.id = a.tenant_id
  where a.tenant_id = v_tenant and a.id = p_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'appointment_id';
  end if;
  if p_to = 'ausente' and (v_starts at time zone v_tz)::date <> (now() at time zone v_tz)::date then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'absent_day';
  end if;
  if p_to = 'concluido' and (p_reason is null or length(btrim(p_reason)) not between 3 and 50) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'reason';   -- chip + até 50 caracteres
  end if;
  perform atta_in.apply_transition(p_id, v_tenant, p_to, p_reason, p_to = 'concluido',
                                   case when p_to = 'ausente' then 'manual' end);
end;
$$;
revoke all on function atta_in.transition_appointment(uuid, text, text) from public, anon;
grant execute on function atta_in.transition_appointment(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- RLS forçada e grants: status nunca por UPDATE direto
-- ---------------------------------------------------------------------------------------------------------------
alter table atta_in.appointment enable row level security;
alter table atta_in.appointment force row level security;
alter table atta_in.appointment_clinic_service enable row level security;
alter table atta_in.appointment_clinic_service force row level security;
alter table atta_in.appointment_transition enable row level security;
alter table atta_in.appointment_transition force row level security;

revoke all on atta_in.appointment, atta_in.appointment_clinic_service, atta_in.appointment_transition
  from public, anon, authenticated;
grant select on atta_in.appointment to authenticated;
grant insert (id, tenant_id, person_id, provisional_patient_id, professional_link_id, appointment_type, modality,
              starts_at, ends_at, return_of_appointment_id) on atta_in.appointment to authenticated;
grant update (professional_link_id, starts_at, ends_at, modality, return_of_appointment_id) on atta_in.appointment
  to authenticated;
grant select, insert, delete on atta_in.appointment_clinic_service to authenticated;
grant select on atta_in.appointment_transition to authenticated;

create policy appointment_select on atta_in.appointment for select to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('appointments', 'view')));
create policy appointment_insert on atta_in.appointment for insert to authenticated
  with check (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('appointments', 'create')));
create policy appointment_update on atta_in.appointment for update to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('appointments', 'edit')))
  with check (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('appointments', 'edit')));
create policy appointment_clinic_service_select on atta_in.appointment_clinic_service for select to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('appointments', 'view')));
create policy appointment_clinic_service_insert on atta_in.appointment_clinic_service for insert to authenticated
  with check (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('appointments', 'edit')));
create policy appointment_clinic_service_delete on atta_in.appointment_clinic_service for delete to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('appointments', 'edit')));
create policy appointment_transition_select on atta_in.appointment_transition for select to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('appointments', 'view')));
