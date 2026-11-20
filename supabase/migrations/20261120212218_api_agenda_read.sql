-- MIG-11c: leitura da Agenda para a tela (MIG-41, Frontend 4), no contrato aceito em
-- Shared/atta/migracao/desenho/mig-41-agenda-contrato.md: api.agenda_day e api.agenda_summary, cada uma devolvendo um
-- jsonb. Tudo calculado no banco, no fuso da clínica (ADR 0001 §4): atrasado, confirmação, ações permitidas, sem
-- documento e os totais; a tela não recalcula. PDD v206 §10.2.1 e §10.2.2.
-- Entra também a ação "Confirmar agendamento" (§10.2.1): só para Agendado futuro, dentro da janela de confirmação
-- (Configurações, padrão 72 h); "Confirmado" é só rótulo (o estado segue Agendado) e remarcar zera a confirmação.
-- Documentos: até os documentos do atendimento existirem (Backend 3), a linha traz os modelos ativos vinculados aos
-- Serviços do agendamento, com o estado 'vinculado'; "sem documento vinculado" = nenhum modelo ativo nos Serviços.

alter table atta_in.appointment add column confirmed_at timestamptz;

-- remarcar zera a confirmação (§10.2.1)
create function atta_in.appointment_reset_confirmation() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.starts_at is distinct from old.starts_at then
    new.confirmed_at := null;
  end if;
  return new;
end;
$$;
revoke all on function atta_in.appointment_reset_confirmation() from public, anon, authenticated;
create trigger appointment_reset_confirmation before update of starts_at on atta_in.appointment
  for each row execute function atta_in.appointment_reset_confirmation();

-- valor efetivo de uma chave inteira para um agendamento, pela cascata das Configurações (MIG-10): Serviço → tipo de
-- atendimento → unidade → padrão do sistema. Com mais de um Serviço com valor próprio, vale o menor (o mais restrito).
-- Interna, sem exigir settings.view: quem chama já conferiu a permissão do que mostra (revisão do Backend 4 no #130).
create function private.appointment_setting_int(p_tenant uuid, p_appointment_id uuid, p_key text) returns bigint
language sql stable set search_path = ''
as $$
  select coalesce(
    (select min(s.value_int) from atta_in.setting s
     join atta_in.appointment_clinic_service acs
       on acs.tenant_id = s.tenant_id and acs.clinic_service_id = s.clinic_service_id
     where s.tenant_id = p_tenant and s.key = p_key and s.level = 'servico' and acs.appointment_id = p_appointment_id),
    (select s.value_int from atta_in.setting s
     join atta_in.appointment a on a.tenant_id = s.tenant_id and a.id = p_appointment_id
     where s.tenant_id = p_tenant and s.key = p_key and s.level = 'tipo_de_atendimento'
       and s.appointment_type = a.appointment_type),
    (select s.value_int from atta_in.setting s where s.tenant_id = p_tenant and s.key = p_key and s.level = 'unidade'),
    (select d.default_int from atta_in.setting_definition d where d.key = p_key))
$$;
revoke all on function private.appointment_setting_int(uuid, uuid, text) from public, anon, authenticated, service_role;

insert into audit.action (action, kind) values ('appointment.confirm', 'change') on conflict (action) do nothing;

create function atta_in.confirm_appointment(p_id uuid) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_appointment atta_in.appointment;
  v_window_h bigint;
begin
  if v_tenant is null or not coalesce((select private.has_permission('appointments', 'edit')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  select * into v_appointment from atta_in.appointment a where a.tenant_id = v_tenant and a.id = p_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'appointment_id';
  end if;
  v_window_h := private.appointment_setting_int(v_tenant, p_id, 'janela_de_confirmacao_h');
  if v_appointment.status <> 'agendado' or v_appointment.confirmed_at is not null
     or v_appointment.starts_at <= now() or v_appointment.starts_at > now() + make_interval(hours => v_window_h::int) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'confirmation';
  end if;
  update atta_in.appointment a set confirmed_at = now(), updated_at = now()
  where a.tenant_id = v_tenant and a.id = p_id;
  perform audit.record_event('appointment.confirm', 'atta_in.appointment', p_id, '{}', null,
    jsonb_build_object('confirmed', true), v_tenant);
end;
$$;
revoke all on function atta_in.confirm_appointment(uuid) from public, anon;
grant execute on function atta_in.confirm_appointment(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Linhas da agenda: o único lugar das regras de leitura (dia, atrasado, confirmação, documentos, ações)
-- ---------------------------------------------------------------------------------------------------------------
create function private.agenda_rows(p_tenant uuid, p_from timestamptz, p_to timestamptz,
                                    p_professional_link_id uuid default null)
returns table (id uuid, starts_at timestamptz, professional_link_id uuid, status text, appointment_type text,
               modality text, row_json jsonb, display_name text, cpf_hmac bytea, has_document boolean)
language sql stable set search_path = ''
as $$
  with ctx as (
    select t.timezone,
           (now() at time zone t.timezone)::date as today,
           coalesce((select s.value_bool from atta_in.setting s
                     where s.tenant_id = p_tenant and s.key = 'fluxo_alternativo_habilitado' and s.level = 'unidade'),
                    (select d.default_bool from atta_in.setting_definition d where d.key = 'fluxo_alternativo_habilitado'))
             as alt_flow
    from platform.tenant t where t.id = p_tenant
  ),
  base as (
    select a.*, c.timezone, c.today, c.alt_flow,
           private.appointment_setting_int(a.tenant_id, a.id, 'janela_de_confirmacao_h') as window_h,
           (a.starts_at at time zone c.timezone)::date as local_day,
           -- paciente: pessoa da rede (em pending, só o que a clínica digitou) ou provisório da importação
           case when a.person_id is not null
                then case when l.network_access = 'pending' then coalesce(l.local_social_name, l.local_full_name)
                          else coalesce(p.social_name, p.full_name) end
                else pr.full_name end as display_name,
           coalesce(p.cpf_masked, pr.cpf_masked) as cpf_masked,
           coalesce(p.cpf_hmac, pr.cpf_hmac) as cpf_hmac,
           pf.display_name as professional_name,
           (select max(g.sent_at) from platform.access_grant g
            where g.tenant_id = a.tenant_id and g.appointment_id = a.id and g.purpose = 'professional_boarding')
             as boarding_check_sent_at,
           coalesce((select jsonb_agg(jsonb_build_object('id', cs.id, 'name', cs.name) order by cs.name)
                     from atta_in.appointment_clinic_service acs
                     join atta_in.clinic_service cs on cs.tenant_id = acs.tenant_id and cs.id = acs.clinic_service_id
                     where acs.tenant_id = a.tenant_id and acs.appointment_id = a.id), '[]'::jsonb) as services,
           coalesce((select jsonb_agg(distinct jsonb_build_object('id', dt.id, 'name', dt.title,
                                                                  'optional', dt.required is false, 'state', 'vinculado'))
                     from atta_in.appointment_clinic_service acs
                     join atta_in.service_document_template sdt
                       on sdt.tenant_id = acs.tenant_id and sdt.clinic_service_id = acs.clinic_service_id
                     join documents.template dt on dt.tenant_id = sdt.tenant_id and dt.id = sdt.template_id
                     where acs.tenant_id = a.tenant_id and acs.appointment_id = a.id and dt.status = 'ativo'),
                    '[]'::jsonb) as documents
    from atta_in.appointment a
    cross join ctx c
    left join network.person p on p.id = a.person_id
    left join network.person_tenant_link l on l.tenant_id = a.tenant_id and l.person_id = a.person_id
    left join network.person_import_provisional pr on pr.tenant_id = a.tenant_id and pr.id = a.provisional_patient_id
    join platform.professional_tenant_link pl on pl.tenant_id = a.tenant_id and pl.id = a.professional_link_id
    left join platform.professional pf on pf.id = pl.professional_id
    where a.tenant_id = p_tenant and a.starts_at >= p_from and a.starts_at < p_to
      and (p_professional_link_id is null or a.professional_link_id = p_professional_link_id)
  ),
  rules as (
    select b.*,
           b.local_day < b.today as is_past,
           b.local_day = b.today as is_today,
           (b.status = 'agendado' and now() > b.starts_at) as late,
           case when b.confirmed_at is not null then 'confirmado'
                when b.starts_at > now() + make_interval(hours => b.window_h::int) then 'fora_da_janela'
                else 'a_confirmar' end as confirmation,
           b.documents <> '[]'::jsonb as has_document
    from base b
  )
  select r.id, r.starts_at, r.professional_link_id, r.status, r.appointment_type, r.modality,
         jsonb_build_object(
           'id', r.id,
           'starts_at', r.starts_at,
           'duration_min', (extract(epoch from (r.ends_at - r.starts_at)) / 60)::int,
           'appointment_type', r.appointment_type,
           'modality', r.modality,
           'patient', jsonb_build_object('person_id', r.person_id, 'provisional_patient_id', r.provisional_patient_id,
                                         'display_name', r.display_name, 'cpf_masked', r.cpf_masked),
           'services', r.services,
           'professional', jsonb_build_object('link_id', r.professional_link_id, 'display_name', r.professional_name),
           'documents', r.documents,
           'status', r.status,
           'late', r.late,
           'confirmation', r.confirmation,
           'boarding_check_sent_at', r.boarding_check_sent_at,
           -- tabela de ações por estado do §10.2.2; data passada: só Detalhes e Envios dos links
           'allowed_actions', (
             select coalesce(jsonb_agg(jsonb_build_object('action', x.action, 'disabled_reason', null) order by x.ord),
                             '[]'::jsonb)
             from (values
               (1, 'editar', not r.is_past and r.status = 'agendado'),
               (2, 'confirmar', not r.is_past and r.status = 'agendado' and r.confirmation = 'a_confirmar'
                                and r.starts_at > now()),
               (3, 'remarcar', not r.is_past and r.status = 'agendado'),
               (4, 'link', not r.is_past and r.status = 'agendado' and r.modality = 'online'),
               (5, 'marcar_ausente', r.is_today and r.status = 'agendado'),
               (6, 'fluxo_alternativo', not r.is_past and r.modality = 'presencial' and r.alt_flow
                                        and ((r.status = 'agendado' and r.is_today) or r.status = 'em_preenchimento')),
               (7, 'fluxo_impresso', not r.is_past and r.modality = 'presencial' and not r.alt_flow
                                     and r.status = 'em_preenchimento'),
               (8, 'reenviar_boarding_check', not r.is_past and r.status in ('pronto', 'em_atendimento')),
               (9, 'concluir_pela_recepcao', not r.is_past and r.status in ('pronto', 'em_atendimento')),
               (10, 'envios_dos_links', r.status in ('pronto', 'em_atendimento', 'concluido') or r.is_past),
               (11, 'enviar_termos', not r.is_past and r.status = 'concluido'),
               (12, 'reabrir_preenchimento', not r.is_past and r.status = 'ausente'),
               (13, 'detalhes', true),
               (14, 'cancelar', not r.is_past and r.status in ('agendado', 'ausente', 'em_preenchimento', 'pronto',
                                                               'em_atendimento'))
             ) x (ord, action, allowed)
             where x.allowed)
         ),
         r.display_name, r.cpf_hmac, r.has_document
  from rules r
$$;
revoke all on function private.agenda_rows(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated, service_role;

-- "sem documento vinculado" (§10.2.2): exclui Avaliação, Retorno e Consulta online, e não conta Concluído nem Cancelado
create function private.agenda_counts_no_document(p_type text, p_modality text, p_status text, p_has_document boolean)
returns boolean language sql immutable set search_path = ''
as $$
  select not p_has_document
     and p_type not in ('avaliacao', 'retorno')
     and not (p_type = 'consulta' and p_modality = 'online')
     and p_status not in ('concluido', 'cancelado')
$$;
revoke all on function private.agenda_counts_no_document(text, text, text, boolean) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- api.agenda_day: as linhas de um dia local, com busca, filtros e página por cursor (starts_at, id)
-- ---------------------------------------------------------------------------------------------------------------
insert into audit.action (action, kind) values ('agenda.read', 'access') on conflict (action) do nothing;

create function api.agenda_day(
  p_local_date date default null,
  p_professional_link_id uuid default null,
  p_search text default null,
  p_cpf_hmac bytea default null,
  p_cursor text default null,
  p_status text[] default null,
  p_no_document boolean default null
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_tz text;
  v_today date;
  v_day date;
  v_after_at timestamptz;
  v_after_id uuid;
  v_pattern text;
  v_rows jsonb;
  v_last record;
  v_count int;
  v_limit constant int := 50;
begin
  if v_tenant is null or not coalesce((select private.has_permission('appointments', 'view')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if num_nonnulls(p_search, p_cpf_hmac) = 2
     or (p_search is not null and length(btrim(p_search)) < 2)
     or (p_cpf_hmac is not null and octet_length(p_cpf_hmac) <> 32)
     or (p_status is not null and not (p_status <@ array['agendado', 'em_preenchimento', 'pronto', 'em_atendimento',
                                                         'concluido', 'ausente', 'cancelado'])) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'query';
  end if;
  if p_cursor is not null then
    begin
      v_after_at := split_part(p_cursor, '|', 1)::timestamptz;
      v_after_id := split_part(p_cursor, '|', 2)::uuid;
    exception when others then
      raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'cursor';
    end;
  end if;
  select t.timezone into v_tz from platform.tenant t where t.id = v_tenant;
  v_today := (now() at time zone v_tz)::date;
  v_day := coalesce(p_local_date, v_today);
  v_pattern := '%' || replace(replace(replace(btrim(coalesce(p_search, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with page as (
    select r.* from private.agenda_rows(v_tenant, (v_day::timestamp at time zone v_tz),
                                       ((v_day + 1)::timestamp at time zone v_tz), p_professional_link_id) r
    where (p_status is null or r.status = any (p_status))
      and (p_no_document is not true
           or private.agenda_counts_no_document(r.appointment_type, r.modality, r.status, r.has_document))
      and (p_search is null or r.display_name ilike v_pattern)
      and (p_cpf_hmac is null or r.cpf_hmac = p_cpf_hmac)
      and (v_after_at is null or (r.starts_at, r.id) > (v_after_at, v_after_id))
    order by r.starts_at, r.id
    limit v_limit + 1
  )
  select coalesce(jsonb_agg(pg.row_json order by pg.starts_at, pg.id) filter (where pg.n <= v_limit), '[]'::jsonb),
         count(*)::int
  into v_rows, v_count
  from (select page.*, row_number() over (order by page.starts_at, page.id) as n from page) pg;

  select (e ->> 'starts_at')::timestamptz as starts_at, (e ->> 'id')::uuid as id into v_last
  from jsonb_array_elements(v_rows) with ordinality as x (e, i) order by i desc limit 1;

  perform audit.record_event('agenda.read', 'atta_in.appointment', null,
    jsonb_build_object('results', jsonb_array_length(v_rows), 'search', p_search is not null or p_cpf_hmac is not null),
    null, null, v_tenant);

  return jsonb_build_object(
    'local_date', v_day,
    'today_local_date', v_today,
    'timezone', v_tz,
    'data', v_rows,
    'page', jsonb_build_object('next_cursor',
      case when v_count > v_limit then to_char(v_last.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                                       || '|' || v_last.id end));
end;
$$;
revoke all on function api.agenda_day(date, uuid, text, bytea, text, text[], boolean) from public, anon;
grant execute on function api.agenda_day(date, uuid, text, bytea, text, text[], boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- api.agenda_summary: os cards do topo (§10.2.2), sempre de hoje, menos Confirmação (futuros)
-- ---------------------------------------------------------------------------------------------------------------
create function api.agenda_summary(p_professional_link_id uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_tz text;
  v_today date;
  v_month_end date;
  v_today_from timestamptz;
  v_today_to timestamptz;
  v_result jsonb;
  v_free int;
begin
  if v_tenant is null or not coalesce((select private.has_permission('appointments', 'view')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  select t.timezone into v_tz from platform.tenant t where t.id = v_tenant;
  v_today := (now() at time zone v_tz)::date;
  v_month_end := (date_trunc('month', v_today) + interval '1 month - 1 day')::date;
  v_today_from := v_today::timestamp at time zone v_tz;
  v_today_to := (v_today + 1)::timestamp at time zone v_tz;

  -- horários livres no mês: blocos de 1 h na janela de cada profissional homologado (PROpass concluído, vínculo vivo),
  -- de hoje ao fim do mês, sem dia de clínica fechada nem de profissional ausente, menos as horas já ocupadas pela
  -- duração de cada agendamento que ocupa horário (não conta Cancelado nem Ausente)
  select coalesce(sum(greatest(0, d.slots - d.busy)), 0)::int into v_free
  from (
    select ps.professional_link_id, g.day,
           -- a pausa do profissional não é horário livre (§10.2.2): sai da janela antes de contar os blocos de 1 h
           floor((extract(epoch from (ps.ends_at - ps.starts_at))
                  - coalesce((select sum(greatest(0, extract(epoch from (least(pb.ends_at, ps.ends_at)
                                                                          - greatest(pb.starts_at, ps.starts_at)))))
                              from atta_in.professional_break pb
                              where pb.tenant_id = ps.tenant_id and pb.professional_link_id = ps.professional_link_id
                                and extract(dow from g.day)::smallint = any (pb.weekdays)), 0)) / 3600)::int as slots,
           coalesce((select ceil(sum(extract(epoch from (a.ends_at - a.starts_at))) / 3600)::int
                     from atta_in.appointment a
                     where a.tenant_id = v_tenant and a.professional_link_id = ps.professional_link_id
                       and a.status not in ('cancelado', 'ausente')
                       and a.starts_at >= (g.day::timestamp at time zone v_tz)
                       and a.starts_at < ((g.day + 1)::timestamp at time zone v_tz)), 0) as busy
    from atta_in.professional_schedule ps
    join platform.professional_tenant_link pl
      on pl.tenant_id = ps.tenant_id and pl.id = ps.professional_link_id
     and pl.deleted_at is null and pl.propass_completed_at is not null
    cross join lateral generate_series(v_today, v_month_end, interval '1 day') as g0 (d)
    cross join lateral (select g0.d::date as day) g
    where ps.tenant_id = v_tenant
      and (p_professional_link_id is null or ps.professional_link_id = p_professional_link_id)
      and extract(dow from g.day)::smallint = any (ps.weekdays)
      and not exists (select 1 from atta_in.special_date sd
                      where sd.tenant_id = v_tenant and g.day between sd.starts_on and sd.ends_on
                        and (sd.kind = 'clinica_fechada'
                             or (sd.kind = 'profissional_ausente' and sd.professional_link_id = ps.professional_link_id)))
  ) d;

  with today as (
    select * from private.agenda_rows(v_tenant, v_today_from, v_today_to, p_professional_link_id)
  ),
  month as (
    select r.status from private.agenda_rows(v_tenant, (date_trunc('month', v_today)::timestamp at time zone v_tz),
                                             v_today_to, p_professional_link_id) r
  ),
  future as (
    select r.status, r.row_json ->> 'confirmation' as confirmation
    from private.agenda_rows(v_tenant, now(), 'infinity'::timestamptz, p_professional_link_id) r
    where r.status = 'agendado'
  )
  select jsonb_build_object(
    'today_remaining', (select count(*) from today where status not in ('concluido', 'cancelado')),
    'today_concluded', (select count(*) from today where status = 'concluido'),
    'month_concluded', (select count(*) from month where status = 'concluido'),
    'month_free_slots', v_free,
    'checkin', jsonb_build_object(
      'em_preenchimento', (select count(*) from today where status = 'em_preenchimento'),
      'pronto', (select count(*) from today where status = 'pronto'),
      'em_atendimento', (select count(*) from today where status = 'em_atendimento')),
    'confirmation', jsonb_build_object(
      'agendados', (select count(*) from future),
      'a_confirmar', (select count(*) from future where confirmation = 'a_confirmar'),
      'confirmados', (select count(*) from future where confirmation = 'confirmado')),
    'no_document', (select count(*) from today
                    where private.agenda_counts_no_document(appointment_type, modality, status, has_document))
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function api.agenda_summary(uuid) from public, anon;
grant execute on function api.agenda_summary(uuid) to authenticated;
