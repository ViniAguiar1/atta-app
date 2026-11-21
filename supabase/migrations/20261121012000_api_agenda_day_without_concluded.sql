-- MIG-11 (Frontend 4, ao ligar a Agenda no #168): o PDD §10.2.2 diz que, "à medida que o atendimento é concluído, ele sai
-- das visões Hoje e Todos e passa para a visão Concluídos". O api.agenda_day deixa o Concluído de fora e recusa pedi-lo no
-- filtro de estado (ATTA-IN-0001 query); a visão Concluídos vem na leitura por período. Os cards do agenda_summary não
-- mudam: "Agendamentos hoje" continua contando os concluídos do dia. Mesma assinatura e mesmos grants.

create or replace function api.agenda_day(
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
                                                         'ausente', 'cancelado'])) then
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
    -- concluído sai do Hoje e do Todos e vai para a visão Concluídos (PDD §10.2.2)
    where r.status <> 'concluido'
      and (p_status is null or r.status = any (p_status))
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
