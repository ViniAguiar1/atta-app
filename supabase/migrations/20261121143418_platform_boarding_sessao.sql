-- MIG-23 (parte 2): a sessão do Boarding Check no servidor real, depois do PIN certo (parte 1, #273). PDD v206 §10.2.3
-- e §13.4; PLANO ("Acesso do profissional ao Formulário de Saúde"); ADR 0004 §3. Só service_role; nenhum id vem do
-- navegador: atendimento, clínica e profissional saem do grant da sessão (cookie atta_grant).
--
-- - private.boarding_session(p_session_hash): o grant professional_boarding JÁ com sessão (session_started_at) e válido
--   pelo private.grant_is_valid (8 h do envio; concluído ou cancelado já revogam, pelo atta_in.apply_transition). Fora
--   disso: 42501 ATTA-AUTH-0004 grant, a mesma resposta (o servidor devolve NAO_AUTENTICADO). O hash do link, antes do
--   PIN, não abre nada aqui.
-- - api.boarding_open(p_session_hash): o resumo do topo do Boarding Check (§10.2.3: identificação, tipo de atendimento,
--   histórico de comparecimento). Cada abertura vai para a trilha (boarding.open). A primeira, com o atendimento Pronto,
--   passa a Em atendimento (atta_in.apply_transition, que grava a transição e a trilha). Em atendimento continua igual.
--   Outro estado: ATTA-IN-0003 status. O Formulário de Saúde NÃO sai daqui: a leitura é a função única do MIG-22
--   (Backend 3), chamada pela porta; até lá, a porta devolve "sem formulário" (Tech Lead, 21/11).
-- - api.boarding_complete(p_session_hash): "Confirmar e concluir atendimento" (§10.2.3), só de Em atendimento. A
--   transição para Concluído passa pela trava dos termos que já existe (private.appointment_documents_guard: obrigatório
--   pendente = ATTA-IN-0003 documents) e revoga o grant na mesma transação. O registro do atendimento
--   (atta_in.appointment_record, Backend 2, ADR 0004 §3) entra na mesma função quando existir.
-- O nome do paciente segue a regra da agenda (api_agenda_read): em 'pending', só o que a clínica digitou; o nome social
-- antes do civil; o provisório da importação pelo nome dele. A idade é calculada no fuso da clínica; sem nascimento, nula.
-- Sempre para a frente.

insert into audit.action (action, kind) values ('boarding.open', 'access') on conflict (action) do nothing;

create function private.boarding_session(p_session_hash bytea, p_lock boolean default false)
returns platform.access_grant
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v platform.access_grant;
begin
  if p_lock then
    select * into v from platform.access_grant g
    where p_session_hash is not null and g.secret_hash = p_session_hash and g.purpose = 'professional_boarding'
      and g.session_started_at is not null
    for update;
  else
    select * into v from platform.access_grant g
    where p_session_hash is not null and g.secret_hash = p_session_hash and g.purpose = 'professional_boarding'
      and g.session_started_at is not null;
  end if;
  if v.id is null or not private.grant_is_valid(v.id, 'professional_boarding') then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004', detail = 'grant';
  end if;
  update platform.access_grant g set last_used_at = now() where g.id = v.id;
  return v;
end;
$$;
revoke all on function private.boarding_session(bytea, boolean) from public, anon, authenticated, service_role;

create function api.boarding_open(p_session_hash bytea)
returns table (clinic_name text, patient_name text, patient_age integer, starts_at_local text, appointment_type text,
               attended_count integer, absent_count integer, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v platform.access_grant := private.boarding_session(p_session_hash, true);
  v_status text;
begin
  select a.status into v_status from atta_in.appointment a where a.tenant_id = v.tenant_id and a.id = v.appointment_id;
  if v_status is null then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004', detail = 'grant';
  end if;
  if v_status = 'pronto' then
    perform atta_in.apply_transition(v.appointment_id, v.tenant_id, 'em_atendimento');
  elsif v_status <> 'em_atendimento' then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'status';
  end if;

  perform audit.record_event('boarding.open', 'atta_in.appointment', v.appointment_id,
    pg_catalog.jsonb_build_object('grant_id', v.id, 'professional_link_id', v.professional_link_id), null, null,
    v.tenant_id);

  return query
  select t.name,
         case when a.person_id is not null
              then case when l.network_access = 'pending' then coalesce(l.local_social_name, l.local_full_name)
                        else coalesce(p.social_name, p.full_name) end
              else pr.full_name end,
         extract(year from pg_catalog.age((now() at time zone t.timezone)::date,
                 case when a.person_id is not null
                      then case when l.network_access = 'pending' then l.local_birth_date else p.birth_date end
                      else pr.birth_date end))::integer,
         pg_catalog.to_char(a.starts_at at time zone t.timezone, 'HH24:MI'),
         a.appointment_type,
         (select count(*)::integer from atta_in.appointment o
          where o.tenant_id = a.tenant_id and o.id <> a.id and o.status = 'concluido'
            and (o.person_id = a.person_id or o.provisional_patient_id = a.provisional_patient_id)),
         (select count(*)::integer from atta_in.appointment o
          where o.tenant_id = a.tenant_id and o.id <> a.id and o.status = 'ausente'
            and (o.person_id = a.person_id or o.provisional_patient_id = a.provisional_patient_id)),
         a.status
  from atta_in.appointment a
  join platform.tenant t on t.id = a.tenant_id
  left join network.person p on p.id = a.person_id
  left join network.person_tenant_link l on l.tenant_id = a.tenant_id and l.person_id = a.person_id
  left join network.person_import_provisional pr on pr.tenant_id = a.tenant_id and pr.id = a.provisional_patient_id
  where a.tenant_id = v.tenant_id and a.id = v.appointment_id;
end;
$$;
revoke all on function api.boarding_open(bytea) from public, anon, authenticated;
grant execute on function api.boarding_open(bytea) to service_role;

create function api.boarding_complete(p_session_hash bytea)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v platform.access_grant := private.boarding_session(p_session_hash, true);
  v_status text;
  v_at timestamptz;
begin
  select a.status into v_status from atta_in.appointment a
  where a.tenant_id = v.tenant_id and a.id = v.appointment_id for update;
  if v_status is distinct from 'em_atendimento' then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'status';
  end if;
  -- a trava dos termos (gatilho) e a revogação do grant vêm do apply_transition, na mesma transação
  perform atta_in.apply_transition(v.appointment_id, v.tenant_id, 'concluido');
  select a.concluded_at into v_at from atta_in.appointment a where a.tenant_id = v.tenant_id and a.id = v.appointment_id;
  return pg_catalog.to_char(v_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
end;
$$;
revoke all on function api.boarding_complete(bytea) from public, anon, authenticated;
grant execute on function api.boarding_complete(bytea) to service_role;
