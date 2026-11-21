-- MIG-12 (R26, decisão do dono pelo CTO, detalhada pelo Tech Lead depois do #158): arquivar é recusado enquanto o
-- paciente tiver agendamento em aberto nesta clínica (P0001, ATTA-IN-0003, detail 'appointments'). Assim um arquivado nunca
-- tem agendamento para remarcar. Desarquivar não muda. Mesma assinatura e mesmos grants.

create or replace function api.patient_set_archived(p_person_id uuid, p_archived boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_was timestamptz;
begin
  if v_tenant is null or not coalesce((select private.has_permission('patients', 'edit')), false)
     or not exists (select 1 from platform.membership m
                    where m.user_id = (select auth.uid()) and m.tenant_id = v_tenant and m.app_role = 'ADMIN'
                      and m.status = 'active' and m.deleted_at is null) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if p_archived is null then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'archived';
  end if;
  select l.archived_at into v_was from network.person_tenant_link l
  where l.tenant_id = v_tenant and l.person_id = p_person_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'person_id';
  end if;
  if (v_was is not null) = p_archived then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'archived';
  end if;
  -- R26 (dono pelo CTO, com o Tech Lead): não arquiva com agendamento em aberto. Conta o futuro ainda Agendado e todo
  -- atendimento já começado (Em preenchimento, Pronto, Em atendimento), que precisa ser concluído ou cancelado. O Agendado
  -- que já passou da hora sem ninguém marcar não trava: ele vira Ausente pela própria agenda. A tela diz "Cancele ou
  -- conclua os agendamentos antes de arquivar." (texto provisório da PO)
  if p_archived and exists (
       select 1 from atta_in.appointment a
       where a.tenant_id = v_tenant and a.person_id = p_person_id
         and (a.status in ('em_preenchimento', 'pronto', 'em_atendimento')
              or (a.status = 'agendado' and a.starts_at > now()))) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'appointments';
  end if;
  update network.person_tenant_link l
  set archived_at = case when p_archived then now() end,
      archived_by = case when p_archived then (select auth.uid()) end
  where l.tenant_id = v_tenant and l.person_id = p_person_id;
  perform audit.record_event(case when p_archived then 'patient.archive' else 'patient.unarchive' end,
    'network.person', p_person_id, '{}', jsonb_build_object('archived', not p_archived),
    jsonb_build_object('archived', p_archived));
  return jsonb_build_object('person_id', p_person_id, 'archived', p_archived);
end;
$$;
