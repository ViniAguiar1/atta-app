-- MIG-12: agendamentos e documentos da Pasta do Paciente (PDD §10 e JF-05; §10.2.2: os concluídos mais antigos ficam só
-- na Pasta; simulador, capturas 13 e 14; contrato fechado com o Frontend 3).
--   - private.agenda_rows ganha p_person_id (opcional, padrão nulo): a Pasta lê só os agendamentos da pessoa, com as
--     mesmas linhas, estados e ações da Agenda, sem varrer a clínica inteira. Quem chama com 4 argumentos não muda.
--   - api.patient_folder_appointments(p_person_id, p_cursor): as linhas da Agenda da pessoa, mais os marcos do
--     atendimento, a pendência de termo obrigatório e a contagem de documentos; os totais do Resumo do paciente e o
--     "Atendimentos hoje". Nada de saúde: documentos só em contagem e estado. Ordem starts_at desc, id desc; 50 por página.

drop function private.agenda_rows(uuid, timestamptz, timestamptz, uuid);
create function private.agenda_rows(p_tenant uuid, p_from timestamptz, p_to timestamptz,
                                    p_professional_link_id uuid default null, p_person_id uuid default null)
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
      and (p_person_id is null or a.person_id = p_person_id)
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
               -- o Fluxo impresso fica sempre disponível nos mesmos estados (§11.3, decisão do CTO); o alternativo só
               -- quando a clínica o habilita
               (7, 'fluxo_impresso', not r.is_past and r.modality = 'presencial'
                                     and ((r.status = 'agendado' and r.is_today) or r.status = 'em_preenchimento')),
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
revoke all on function private.agenda_rows(uuid, timestamptz, timestamptz, uuid, uuid) from public, anon, authenticated, service_role;

insert into audit.action (action, kind) values ('patient.appointments_list', 'access') on conflict (action) do nothing;

create function api.patient_folder_appointments(p_person_id uuid, p_cursor text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_tz text;
  v_today date;
  v_before_at timestamptz;
  v_before_id uuid;
  v_all jsonb;
  v_rows jsonb;
  v_count int;
  v_last record;
  v_totals jsonb;
  v_today_json jsonb;
  v_limit constant int := 50;
begin
  if v_tenant is null or not coalesce((select private.has_permission('patients', 'view')), false)
     or not coalesce((select private.has_permission('appointments', 'view')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if not exists (select 1 from network.person_tenant_link l join network.person p on p.id = l.person_id
                 where l.tenant_id = v_tenant and l.person_id = p_person_id and p.deleted_at is null) then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'person_id';
  end if;
  if p_cursor is not null then
    begin
      v_before_at := split_part(p_cursor, '|', 1)::timestamptz;
      v_before_id := split_part(p_cursor, '|', 2)::uuid;
    exception when others then
      raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'cursor';
    end;
  end if;
  select t.timezone into v_tz from platform.tenant t where t.id = v_tenant;
  v_today := (now() at time zone v_tz)::date;

  -- todas as linhas da pessoa nesta clínica (poucas por paciente), em ordem desc; a página e os totais saem delas
  select coalesce(jsonb_agg(x.row_json order by x.starts_at desc, x.id desc), '[]'::jsonb) into v_all
  from (select r.id, r.starts_at,
               r.row_json || jsonb_build_object(
                 'milestones', jsonb_build_object('checkin_at', a.checkin_started_at, 'ready_at', a.ready_at,
                                                  'in_service_at', a.in_service_at, 'concluded_at', a.concluded_at),
                 'pending', (select case when count(*) = 0 then null
                                         else jsonb_build_object('kind', 'termo_nao_assinado', 'required', true) end
                             from private.appointment_terms_pending(a.id)),
                 'terms_count', (select count(*) from documents.document d
                                 where d.tenant_id = a.tenant_id and d.appointment_id = a.id
                                   and d.folder_section = 'termos' and d.status not in ('cancelado', 'substituido')
                                   and d.auto_excluded_at is null),
                 'clinical_docs_count', (select count(*) from documents.document d
                                         where d.tenant_id = a.tenant_id and d.appointment_id = a.id
                                           and d.folder_section = 'docs_clinicos'
                                           and d.status not in ('cancelado', 'substituido'))) as row_json
        from private.agenda_rows(v_tenant, '-infinity'::timestamptz, 'infinity'::timestamptz, null, p_person_id) r
        join atta_in.appointment a on a.tenant_id = v_tenant and a.id = r.id) x;

  select coalesce(jsonb_agg(e order by i) filter (where n <= v_limit), '[]'::jsonb), count(*)::int
  into v_rows, v_count
  from (select e, i, row_number() over (order by i) as n
        from jsonb_array_elements(v_all) with ordinality as y (e, i)
        where v_before_at is null
           or ((e ->> 'starts_at')::timestamptz, (e ->> 'id')::uuid) < (v_before_at, v_before_id)
        order by i
        limit v_limit + 1) z;

  select (e ->> 'starts_at')::timestamptz as starts_at, (e ->> 'id')::uuid as id into v_last
  from jsonb_array_elements(v_rows) with ordinality as y (e, i) order by i desc limit 1;

  select jsonb_build_object(
           'appointments', jsonb_array_length(v_all),
           'terms_signed', (select count(*) from documents.document d
                            where d.tenant_id = v_tenant and d.person_id = p_person_id and d.folder_section = 'termos'
                              and d.status in ('pre_assinado', 'assinado_definitivo')),
           'clinical_docs', (select count(*) from documents.document d
                             where d.tenant_id = v_tenant and d.person_id = p_person_id
                               and d.folder_section = 'docs_clinicos' and d.status not in ('cancelado', 'substituido')),
           'pendencies', (select count(*) from jsonb_array_elements(v_all) e where e -> 'pending' <> 'null'::jsonb))
    into v_totals;
  select jsonb_build_object('count', count(*), 'last_at', max((e ->> 'starts_at')::timestamptz)) into v_today_json
  from jsonb_array_elements(v_all) e
  where e ->> 'status' <> 'cancelado' and ((e ->> 'starts_at')::timestamptz at time zone v_tz)::date = v_today;

  -- trilha só com contagens (ADR 0003); o "não encontrado" acima não grava
  perform audit.record_event('patient.appointments_list', 'network.person', p_person_id,
    jsonb_build_object('results', jsonb_array_length(v_rows), 'total', jsonb_array_length(v_all)));

  return jsonb_build_object(
    'totals', v_totals,
    'today', v_today_json,
    'timezone', v_tz,
    'data', v_rows,
    'page', jsonb_build_object('next_cursor',
      case when v_count > v_limit then to_char(v_last.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                                       || '|' || v_last.id end));
end;
$$;
revoke all on function api.patient_folder_appointments(uuid, text) from public, anon;
grant execute on function api.patient_folder_appointments(uuid, text) to authenticated;
