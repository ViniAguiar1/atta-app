-- MIG-14b: o profissional que concluiu o PROpass sem a conferência do conselho não recebe agendamento (decisão do dono,
-- PLANO "Conferência do conselho no PROpass"; ADR 0006 §3; pedido do CTO com prioridade, 21/11). Três partes:
--   1. atta_in.appointment_validate: no insert e na troca de profissional, recusa (P0001 ATTA-IN-0003, detail
--      council_status) quem não está em regularizado. O resto do gatilho é o mesmo do 20261120193615.
--   2. api.agenda_summary: os horários livres do mês contam só profissional regularizado (o resto é o do
--      20261121003139).
--   3. api.professional_list: devolve também o council_status, para o Novo agendamento listar só regularizado e a
--      Equipe mostrar "aguardando conferência". Mudar o retorno pede drop + create; grants iguais.
-- O valor nao_consultado vira aguardando_conferencia no PR do backoffice; a trava confere o positivo (regularizado),
-- então não muda com o renome.

create or replace function atta_in.appointment_validate() returns trigger
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
  -- editar e remarcar só em Agendado (tabela de ações do §10.2.2)
  if tg_op = 'UPDATE' and old.status <> 'agendado' then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'status';
  end if;
  if not exists (select 1 from platform.professional_tenant_link l
                 where l.tenant_id = new.tenant_id and l.id = new.professional_link_id
                   and l.deleted_at is null and l.propass_completed_at is not null) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'professional_link_id';
  end if;
  -- conferência do conselho (decisão do dono, PLANO; ADR 0006 §3): só profissional regularizado recebe agendamento
  -- novo ou troca para ele. aguardando conferência (hoje nao_consultado), reprovado ou sem estado: recusado. O que já
  -- está marcado não muda por aqui (editar a hora de um agendamento antigo segue valendo)
  if (tg_op = 'INSERT' or new.professional_link_id is distinct from old.professional_link_id)
     and not exists (select 1 from platform.professional_tenant_link l
                     join platform.professional p on p.id = l.professional_id and p.deleted_at is null
                     where l.tenant_id = new.tenant_id and l.id = new.professional_link_id
                       and p.council_status = 'regularizado') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'council_status';
  end if;
  -- a trava de "termo de autorização válido" do profissional (§10.4.3) entra aqui quando o authorization_status do
  -- MIG-14b parte 2 (Backend 4) existir
  -- trocar o profissional: os Serviços já marcados precisam estar autorizados ao novo (revisão do Backend 4 no #96)
  if tg_op = 'UPDATE' and new.professional_link_id is distinct from old.professional_link_id
     and exists (select 1 from atta_in.appointment_clinic_service s
                 where s.tenant_id = new.tenant_id and s.appointment_id = new.id
                   and not exists (select 1 from atta_in.professional_service ps
                                   where ps.tenant_id = new.tenant_id and ps.professional_link_id = new.professional_link_id
                                     and ps.clinic_service_id = s.clinic_service_id)) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'clinic_service_id';
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

create or replace function api.agenda_summary(p_professional_link_id uuid default null) returns jsonb
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

  -- horários livres no mês: blocos de 1 h na janela de cada profissional homologado (PROpass concluído, vínculo vivo,
  -- conselho regularizado),
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
    -- só quem pode receber agendamento (conselho regularizado, ADR 0006 §3) tem horário livre
    join platform.professional pr on pr.id = pl.professional_id and pr.deleted_at is null
     and pr.council_status = 'regularizado'
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

drop function api.professional_list();
create function api.professional_list()
returns table (link_id uuid, status text, invite_email_enc bytea, invite_envelope_id uuid, invite_dek_wrapped bytea,
               invite_kek_version smallint, professional_id uuid, display_name text, council text, council_uf text,
               council_number text, phone_enc bytea, email_enc bytea, dek_wrapped bytea, kek_version smallint,
               invited_at timestamptz, council_status text)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_count int;
begin
  if v_tenant is null or not coalesce((select private.has_permission('team', 'view')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  return query
  select l.id, case when l.professional_id is null then 'convite_enviado' else 'cadastro_concluido' end,
         case when l.professional_id is null then l.invite_email_enc end,
         case when l.professional_id is null then l.envelope_id end,
         case when l.professional_id is null then l.dek_wrapped end,
         case when l.professional_id is null then l.kek_version end,
         p.id, p.display_name, p.council, p.council_uf, p.council_number, p.phone_enc, p.email_enc, p.dek_wrapped,
         p.kek_version, l.invited_at, p.council_status
  from platform.professional_tenant_link l
  left join platform.professional p on p.id = l.professional_id and p.deleted_at is null
  where l.tenant_id = v_tenant and l.deleted_at is null
  order by lower(p.display_name) nulls last, l.invited_at, l.id
  limit 500;
  get diagnostics v_count = row_count;
  perform audit.record_event('professional.list', 'platform.professional_tenant_link', null,
    jsonb_build_object('results', v_count));
end;
$$;

revoke all on function api.professional_list() from public, anon;
grant execute on function api.professional_list() to authenticated;
