-- MIG-21 (parte 2) · termos do atendimento: vincular, conferir os obrigatórios, consolidar na conclusão e cancelar com o
-- agendamento. PDD v206 §10.2.1 (os documentos se vinculam ao criar ou editar o agendamento), §10.2.2 (cancelado: "Os
-- documentos que não estão em Assinado definitivo vão para Cancelado com o motivo"), §10.2.3 (termo obrigatório que não
-- foi assinado nem recusado impede a conclusão; recusado é excluído automaticamente na conclusão, com registro), §16.4
-- RN-B-01/02 e §10.2.2 RN-CHK-02 (liberação só com os obrigatórios Pré-assinados), §17.6 (ciclo de vida).
--
-- A regra fica no banco, por gatilho no agendamento (ADR 0001 §1): vale para qualquer caminho de transição (recepção,
-- Boarding Check, check-in), sem depender de quem chama. Quem escolhe os termos é a tela (o modal do agendamento e o
-- "Vincular novo termo"); o banco só confere e grava. O reaproveitamento do termo "Única" está em aberto no PDD
-- (§11.6 × §16.5), com o CTO: aqui nada é pulado nem acrescentado.
-- Sempre para a frente.

-- ---------------------------------------------------------------------------------------------------------------
-- Documento: motivo do cancelamento em cascata (os do agendamento, §10.2.2) e a exclusão automática na conclusão
-- ---------------------------------------------------------------------------------------------------------------
alter table documents.document drop constraint document_cancel_reason_check;
alter table documents.document add constraint document_cancel_reason_check check (cancel_reason in (
  -- os 6 chips da lixeira do Boarding Check (§10.2.3)
  'paciente_desistiu', 'contraindicacao', 'procedimento_substituido', 'erro_de_registro', 'indisponibilidade_de_insumo',
  'no_show',
  -- os do cancelamento do agendamento, que o documento herda (§10.2.2; lista do MIG-11b)
  'cancelado_pelo_paciente', 'cancelado_pela_clinica', 'agendado_por_engano', 'contraindicacao_identificada',
  'paciente_solicitou_cancelamento', 'conflito_agenda_profissional', 'indisponibilidade_insumo'));

-- §10.2.3: o termo recusado (e o opcional que ficou sem assinatura) "não gera documento nem é registrado: é excluído
-- automaticamente depois do atendimento [...] com registro de que a exclusão foi automática". Ninguém apaga documento
-- (§17.6): a linha fica, marcada, fora da Pasta, e a marca não sai mais.
alter table documents.document add column auto_excluded_at timestamptz;
alter table documents.document add constraint document_auto_excluded_check check (
  auto_excluded_at is null or status in ('recusado', 'aguardando_assinatura'));

create or replace function private.document_guard_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0002', detail = 'document_delete';
  end if;
  -- excluído automaticamente: não muda mais de estado e a marca não sai
  if old.auto_excluded_at is not null
     and (new.status is distinct from old.status or new.auto_excluded_at is distinct from old.auto_excluded_at) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0002', detail = 'document_status';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'aguardando_assinatura' and new.status in ('pre_assinado', 'recusado', 'cancelado'))
    or (old.status = 'pre_assinado' and new.status in ('assinado_definitivo', 'cancelado'))
    or (old.status = 'assinado_definitivo' and new.status = 'substituido')
  ) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0002', detail = 'document_status';
  end if;
  if old.replaced_by_document_id is not null and new.replaced_by_document_id is distinct from old.replaced_by_document_id then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0002', detail = 'document_identity';
  end if;
  if (new.tenant_id, new.person_id, new.professional_link_id, new.template_version_id, new.folder_section,
      new.appointment_id)
       is distinct from (old.tenant_id, old.person_id, old.professional_link_id, old.template_version_id,
                         old.folder_section, old.appointment_id) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0002', detail = 'document_identity';
  end if;
  return new;
end
$$;

insert into audit.action (action, kind) values
  ('document.link', 'change'), ('document.finalize', 'change'), ('document.auto_exclude', 'change'),
  ('document.cancel', 'change')
on conflict (action) do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- Agendamento do contexto: a mesma clínica do token, quando há token (o Boarding Check chega por service_role, sem
-- token; quem chama já resolveu o grant). Outra clínica e inexistente dão a mesma resposta.
-- ---------------------------------------------------------------------------------------------------------------
create function private.appointment_for_documents(p_appointment_id uuid)
returns atta_in.appointment
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token_tenant uuid := (select private.current_tenant_id());
  a atta_in.appointment;
begin
  select * into a from atta_in.appointment x where x.id = p_appointment_id for update;
  if not found or (v_token_tenant is not null and a.tenant_id <> v_token_tenant) then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'appointment_id';
  end if;
  return a;
end;
$$;
revoke all on function private.appointment_for_documents(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Vincular: cria um documento Aguardando assinatura por modelo, na versão vigente (RN-DOC-02). Modelo já vivo no
-- atendimento (aguardando, pré-assinado ou definitivo) não duplica; recusado ou cancelado pode voltar ("Restaurar",
-- §10.2.3). Paciente provisório da importação ainda não tem pessoa: vincula quando o check-in o identificar.
-- ---------------------------------------------------------------------------------------------------------------
create function private.appointment_link_documents(p_appointment_id uuid, p_template_ids uuid[])
returns table (document_id uuid, template_id uuid, created boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a atta_in.appointment := private.appointment_for_documents(p_appointment_id);
  v_ids uuid[];
  r record;
  v_doc uuid;
begin
  if a.status in ('concluido', 'cancelado') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'status';
  end if;
  if a.person_id is null then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'person_id';
  end if;
  select coalesce(array_agg(distinct t order by t), '{}') into v_ids
  from unnest(coalesce(p_template_ids, '{}')) t where t is not null;
  if pg_catalog.cardinality(v_ids) = 0 or pg_catalog.cardinality(v_ids) > 50 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'template_ids';
  end if;
  -- só modelo Ativo desta clínica, de paciente (o Termo de Autorização é do profissional) e já publicado
  if exists (select 1 from unnest(v_ids) i
             where not exists (select 1 from documents.template t
                               where t.id = i and t.tenant_id = a.tenant_id and t.status = 'ativo'
                                 and t.current_version is not null and t.kind <> 'termo_de_autorizacao')) then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'template_ids';
  end if;

  for r in
    select t.id as template_id, v.id as version_id, v.version
    from documents.template t
    join documents.template_version v on v.tenant_id = t.tenant_id and v.template_id = t.id and v.version = t.current_version
    where t.tenant_id = a.tenant_id and t.id = any (v_ids)
    order by t.id
    for share of t
  loop
    select d.id into v_doc
    from documents.document d
    join documents.template_version v on v.tenant_id = d.tenant_id and v.id = d.template_version_id
    where d.tenant_id = a.tenant_id and d.appointment_id = a.id and v.template_id = r.template_id
      and d.status in ('aguardando_assinatura', 'pre_assinado', 'assinado_definitivo') and d.auto_excluded_at is null
    limit 1;
    if found then
      return query select v_doc, r.template_id, false;
      continue;
    end if;
    insert into documents.document (tenant_id, template_version_id, person_id, folder_section, appointment_id, created_by)
    values (a.tenant_id, r.version_id, a.person_id, 'termos', a.id, (select auth.uid()))
    returning id into v_doc;
    perform audit.record_event('document.link', 'documents.document', v_doc,
      jsonb_build_object('appointment_id', a.id, 'template_id', r.template_id, 'version', r.version),
      null, jsonb_build_object('status', 'aguardando_assinatura'), a.tenant_id);
    return query select v_doc, r.template_id, true;
  end loop;
end;
$$;
revoke all on function private.appointment_link_documents(uuid, uuid[]) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Pendências: termos obrigatórios do atendimento que não foram assinados nem recusados (a tela diz o que falta, §10.2.3).
-- Pronto = nenhuma pendência. Opcional nunca trava (RN-B-02).
-- ---------------------------------------------------------------------------------------------------------------
create function private.appointment_terms_pending(p_appointment_id uuid)
returns table (document_id uuid, template_id uuid, title text)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, v.template_id, v.title
  from atta_in.appointment a
  join documents.document d on d.tenant_id = a.tenant_id and d.appointment_id = a.id
  join documents.template_version v on v.tenant_id = d.tenant_id and v.id = d.template_version_id
  where a.id = p_appointment_id
    and ((select private.current_tenant_id()) is null or a.tenant_id = (select private.current_tenant_id()))
    and d.status = 'aguardando_assinatura' and d.auto_excluded_at is null and v.required
  order by lower(v.title), d.id
$$;
revoke all on function private.appointment_terms_pending(uuid) from public, anon, authenticated, service_role;

create function private.appointment_terms_ready(p_appointment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select not exists (select 1 from private.appointment_terms_pending(p_appointment_id)) $$;
revoke all on function private.appointment_terms_ready(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Gatilhos no agendamento: a trava antes da transição e os documentos depois dela, na mesma transação
-- ---------------------------------------------------------------------------------------------------------------
create function private.appointment_documents_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Pronto (liberação, RN-CHK-02) e Concluído (§10.2.3) só com os obrigatórios assinados ou recusados
  if new.status is distinct from old.status and new.status in ('pronto', 'concluido')
     and exists (select 1 from private.appointment_terms_pending(new.id)) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'documents';
  end if;
  return new;
end;
$$;
revoke all on function private.appointment_documents_guard() from public, anon, authenticated, service_role;
create trigger appointment_documents_guard before update of status on atta_in.appointment
  for each row execute function private.appointment_documents_guard();

create function private.appointment_documents_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if new.status is not distinct from old.status then
    return null;
  end if;
  if new.status = 'concluido' then
    -- Pré-assinado vira Assinado definitivo (§10.2.3, §13.5)
    for r in
      update documents.document d set status = 'assinado_definitivo'
      where d.tenant_id = new.tenant_id and d.appointment_id = new.id and d.status = 'pre_assinado'
      returning d.id
    loop
      perform audit.record_event('document.finalize', 'documents.document', r.id,
        jsonb_build_object('appointment_id', new.id, 'by_reception', new.concluded_by_reception),
        jsonb_build_object('status', 'pre_assinado'), jsonb_build_object('status', 'assinado_definitivo'), new.tenant_id);
    end loop;
    -- recusado e opcional sem assinatura: excluídos automaticamente, com registro (§10.2.3)
    for r in
      update documents.document d set auto_excluded_at = now()
      where d.tenant_id = new.tenant_id and d.appointment_id = new.id and d.auto_excluded_at is null
        and d.status in ('recusado', 'aguardando_assinatura')
      returning d.id, d.status
    loop
      perform audit.record_event('document.auto_exclude', 'documents.document', r.id,
        jsonb_build_object('appointment_id', new.id, 'by_reception', new.concluded_by_reception, 'status', r.status),
        jsonb_build_object('auto_excluded', false), jsonb_build_object('auto_excluded', true), new.tenant_id);
    end loop;
  elsif new.status = 'cancelado' then
    -- tudo o que não está em Assinado definitivo vai a Cancelado com o motivo do agendamento (§10.2.2)
    for r in
      update documents.document d
      set status = 'cancelado', cancel_reason = new.cancel_reason, cancelled_at = now(), cancelled_by = (select auth.uid())
      where d.tenant_id = new.tenant_id and d.appointment_id = new.id and d.auto_excluded_at is null
        and d.status in ('aguardando_assinatura', 'pre_assinado')
      returning d.id
    loop
      perform audit.record_event('document.cancel', 'documents.document', r.id,
        jsonb_build_object('appointment_id', new.id, 'reason', new.cancel_reason, 'cascade', true),
        null, jsonb_build_object('status', 'cancelado'), new.tenant_id);
    end loop;
  end if;
  return null;
end;
$$;
revoke all on function private.appointment_documents_apply() from public, anon, authenticated, service_role;
create trigger appointment_documents_apply after update of status on atta_in.appointment
  for each row execute function private.appointment_documents_apply();
