-- MIG-11: "Reabrir preenchimento" de um Ausente pelo PDD v206 §10.2.2 (decisão da PO, 18/11/2026; o Tech Lead pediu o PR
-- curto antes do resto do MIG-13): "o atendimento volta para Agendado; o paciente retoma o check-in do ponto exato em que
-- parou … A reabertura exige motivo escolhido em lista fechada (Paciente chegou atrasado; Paciente avisou que chegaria
-- mais tarde e a clínica ajustou o horário do atendimento; Marcado como ausente por engano) e fica na Auditoria com autor e
-- horário; o atendimento reaberto não volta a ser marcado como ausente automaticamente."
--   - a máquina de estados: Ausente → Agendado (antes ia para Em preenchimento, que é do check-in); o paciente não reabre
--     sozinho (§11.9: o check-in de um Ausente orienta a procurar a recepção);
--   - atta_in.transition_appointment(p_id, 'agendado', p_reason): só de Ausente, só no dia (dedução da regra "qualquer
--     estado em data passada: nada que altere o atendimento", a mesma da tabela de ações) e com um dos 3 códigos:
--       paciente_chegou_atrasado | paciente_avisou_clinica_ajustou_horario | ausente_por_engano
--     fora da lista, ATTA-IN-0001 reason. A transição e o motivo vão para atta_in.appointment_transition e para a trilha
--     appointment.transition (com autor e horário), como as outras;
--   - reopened_at marca o atendimento reaberto: a ausência automática (MIG-13) não o marca de novo.

alter table atta_in.appointment add column reopened_at timestamptz;

create or replace function atta_in.apply_transition(p_id uuid, p_tenant uuid, p_to text, p_reason text default null,
                                         p_by_reception boolean default false, p_absent_mode text default null,
                                         p_justification text default null)
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
    -- Ausente volta para Agendado pelo "Reabrir preenchimento" da recepção (§10.2.2); o paciente não reabre sozinho
    when 'ausente' then array['agendado', 'cancelado']
    else array[]::text[] end;
  if not p_to = any (v_allowed) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'status';
  end if;
  -- cancelar: motivo da lista certa para o momento (antes ou depois da chegada)
  if p_to = 'cancelado' and (p_reason is null or not p_reason = any (
       case when v_from in ('agendado', 'ausente')
            then array['cancelado_pelo_paciente', 'cancelado_pela_clinica', 'agendado_por_engano']
            else array['paciente_desistiu', 'contraindicacao_identificada', 'paciente_solicitou_cancelamento',
                       'conflito_agenda_profissional', 'indisponibilidade_insumo'] end)) then
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
    cancel_reason = case when p_to = 'cancelado' then p_reason else a.cancel_reason end,
    reopened_at = case when p_to = 'agendado' then now() else a.reopened_at end,
    updated_at = now()
  where a.tenant_id = p_tenant and a.id = p_id;

  insert into atta_in.appointment_transition (tenant_id, appointment_id, from_status, to_status, reason, justification)
  values (p_tenant, p_id, v_from, p_to, p_reason, nullif(btrim(coalesce(p_justification, '')), ''));

  -- concluído ou cancelado: os links do atendimento (Boarding Check e o do paciente) param de valer na hora
  -- (RN-FIC-07; ADR 0004 §3; Segurança, revisão do #96)
  if p_to in ('concluido', 'cancelado') then
    update platform.access_grant g set revoked_at = now()
    where g.tenant_id = p_tenant and g.appointment_id = p_id and g.revoked_at is null;
  end if;
  -- o motivo fica na tabela de transições (lida com RLS); na trilha, só os estados e quem concluiu
  perform audit.record_event('appointment.transition', 'atta_in.appointment', p_id,
    jsonb_build_object('by_reception', p_by_reception, 'reason', p_reason, 'has_justification', p_justification is not null),
    jsonb_build_object('status', v_from), jsonb_build_object('status', p_to), p_tenant);
end;
$$;

create or replace function atta_in.transition_appointment(p_id uuid, p_to text, p_reason text default null,
                                               p_justification text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_starts timestamptz;
  v_tz text;
  v_status text;
begin
  if v_tenant is null or not coalesce((select private.has_permission('appointments', 'edit')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  -- Agendado pela recepção é só o "Reabrir preenchimento" de um Ausente (§10.2.2); Em preenchimento vem do check-in
  if p_to not in ('ausente', 'cancelado', 'concluido', 'agendado') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'status';
  end if;
  select a.starts_at, t.timezone, a.status into v_starts, v_tz, v_status
  from atta_in.appointment a join platform.tenant t on t.id = a.tenant_id
  where a.tenant_id = v_tenant and a.id = p_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'appointment_id';
  end if;
  -- Reabrir preenchimento (§10.2.2): só de um Ausente, só no dia (data passada não altera o atendimento) e com o motivo
  -- da lista fechada da PO (18/11/2026)
  if p_to = 'agendado' then
    if v_status <> 'ausente' then
      raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'status';
    end if;
    if (v_starts at time zone v_tz)::date <> (now() at time zone v_tz)::date then
      raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'reopen_day';
    end if;
    if p_reason is null or p_reason not in ('paciente_chegou_atrasado', 'paciente_avisou_clinica_ajustou_horario',
                                            'ausente_por_engano') then
      raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'reason';
    end if;
  end if;
  if p_to = 'ausente' and (v_starts at time zone v_tz)::date <> (now() at time zone v_tz)::date then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'absent_day';
  end if;
  -- Concluir pela recepção (§10.2.3): motivo em chip fixo e justificativa escrita de no mínimo 50 caracteres. As travas
  -- de termo obrigatório e de registro do atendimento entram com o MIG-13 (private.appointment_terms_ready, Backend 3)
  if p_to = 'concluido' then
    if p_reason is null or p_reason not in ('profissional_inacessivel', 'emergencia_clinica', 'falha_tecnica_no_acesso') then
      raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'reason';
    end if;
    if p_justification is null or length(btrim(p_justification)) < 50 then
      raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'justification';
    end if;
  end if;
  perform atta_in.apply_transition(p_id, v_tenant, p_to, p_reason, p_to = 'concluido',
                                   case when p_to = 'ausente' then 'manual' end, p_justification);
end;
$$;
