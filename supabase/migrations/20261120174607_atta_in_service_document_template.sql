-- MIG-20 (parte 2): vínculo modelo de documento × procedimento (Serviço). PDD v206 §10.3.1 ("a aplicabilidade de um
-- modelo é exclusivamente a vinculação a procedimento(s) cadastrado(s)"; "todo termo deve estar vinculado a um ou mais
-- procedimentos"; recomenda-se 1 : 1), §10.2.1 (ao escolher o procedimento no agendamento, os documentos vinculados
-- entram já marcados) e §10.4.7 (o vínculo se cadastra em Termos & Docs, não em Serviços).
--
-- Mora no produto (atta_in), porque a plataforma não referencia atta_in (decisão 0001 §1, aprovada pelo Tech Lead):
-- o Clinic e o Pro terão os próprios vínculos sobre o mesmo documents.template. FKs compostas com a clínica.
-- Lê quem agenda (Agendamentos) e quem cuida dos modelos (Termos & Docs); grava só por função, com auditoria.
-- O Termo de Autorização do profissional (§10.4.3) não é de procedimento e não entra aqui.

create table atta_in.service_document_template (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references platform.tenant (id),
  clinic_service_id uuid not null,
  template_id       uuid not null,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  constraint service_document_template_service_fk foreign key (tenant_id, clinic_service_id)
    references atta_in.clinic_service (tenant_id, id),
  constraint service_document_template_template_fk foreign key (tenant_id, template_id)
    references documents.template (tenant_id, id),
  constraint service_document_template_uq unique (tenant_id, clinic_service_id, template_id)
);
create index service_document_template_template_idx on atta_in.service_document_template (tenant_id, template_id);

alter table atta_in.service_document_template enable row level security;
alter table atta_in.service_document_template force row level security;
revoke all on atta_in.service_document_template from public, anon, authenticated, service_role;
grant select on atta_in.service_document_template to authenticated;

create policy service_document_template_select on atta_in.service_document_template for select to authenticated
  using (tenant_id = (select private.current_tenant_id())
         and ((select private.has_permission('documents', 'view'))
              or (select private.has_permission('appointments', 'view'))));

insert into audit.action (action, kind) values ('template.services_set', 'change')
on conflict (action) do nothing;

-- Define o conjunto inteiro de procedimentos de um modelo, numa transação só (a tela de Termos & Docs manda a lista
-- marcada). Modelo Ativo precisa de pelo menos um procedimento (§10.3.1); Rascunho pode ficar sem, até publicar.
-- Inativo não muda. Só Serviços vivos da própria clínica. Devolve quantos ficaram.
create function api.template_set_services(p_template_id uuid, p_service_ids uuid[])
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_status text;
  v_kind text;
  v_version integer;
  v_ids uuid[];
  v_before uuid[];
  v_count integer;
begin
  if v_tenant is null then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  select t.status, t.kind, t.current_version into v_status, v_kind, v_version
  from documents.template t
  where t.id = p_template_id and t.tenant_id = v_tenant
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'template_id';
  end if;
  if not coalesce((select private.has_permission('documents',
                     case when v_version is null then 'create' else 'edit' end)), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if v_status = 'inativo' then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0002', detail = 'template_inactive';
  end if;
  if v_kind = 'termo_de_autorizacao' then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'kind';
  end if;

  select coalesce(array_agg(distinct s order by s), '{}') into v_ids
  from unnest(coalesce(p_service_ids, '{}')) s where s is not null;
  if pg_catalog.cardinality(v_ids) > 50 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'service_ids';
  end if;
  if v_status = 'ativo' and pg_catalog.cardinality(v_ids) = 0 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'service_ids';
  end if;
  if exists (select 1 from unnest(v_ids) s
             where not exists (select 1 from atta_in.clinic_service c
                               where c.id = s and c.tenant_id = v_tenant and c.deleted_at is null)) then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'service_ids';
  end if;

  select coalesce(array_agg(l.clinic_service_id order by l.clinic_service_id), '{}') into v_before
  from atta_in.service_document_template l
  where l.tenant_id = v_tenant and l.template_id = p_template_id;
  if v_before = v_ids then
    return pg_catalog.cardinality(v_ids);
  end if;

  delete from atta_in.service_document_template l
  where l.tenant_id = v_tenant and l.template_id = p_template_id and l.clinic_service_id <> all (v_ids);
  insert into atta_in.service_document_template (tenant_id, clinic_service_id, template_id)
  select v_tenant, s, p_template_id from unnest(v_ids) s
  on conflict (tenant_id, clinic_service_id, template_id) do nothing;
  v_count := pg_catalog.cardinality(v_ids);

  perform audit.record_event('template.services_set', 'documents.template', p_template_id, '{}'::jsonb,
    jsonb_build_object('clinic_service_ids', to_jsonb(v_before)),
    jsonb_build_object('clinic_service_ids', to_jsonb(v_ids)));
  return v_count;
end;
$$;

revoke all on function api.template_set_services(uuid, uuid[]) from public, anon, service_role;
grant execute on function api.template_set_services(uuid, uuid[]) to authenticated;
