-- MIG-20 (parte 5): o que a tela Termos & Docs › Modelos de documento precisa para ficar igual à captura 39 do
-- simulador (MIG-44, Frontend 6). PDD v206 §10.3.1 (Meus modelos), §17.5 (versão com data de publicação), §18.5
-- (documento assinado tem pacote de evidências). Os totais vêm do servidor (ADR 0001 §5).
--
-- api.atta_in_template_list ganha:
--   clinic_services              [{id, name}] dos Serviços vivos vinculados, pelo nome (os chips da coluna Procedimentos);
--   current_version_published_at quando a versão atual foi publicada (coluna Versão, "desde dd/mm/aaaa");
--   signed_count                 documentos assinados do modelo, em qualquer versão: com evidência do ATTA Sign e em
--                                Assinado definitivo ou Substituído (§10.2.3, §17.6). O Pré-assinado de atendimento aberto
--                                e o cancelado não contam (revisão do Backend 3 no #148).
-- api.atta_in_template_summary: os cartões do topo. "Vencendo" e "vencidos para reassinar" vêm nulos: o início da
-- validade do "Única" e o "perto de vencer" (RN-V-05) estão com a PO (R17); a tela mostra "—".
-- Sempre para a frente: a lista muda de forma (colunas novas no fim), então sai e volta com o mesmo nome e grants.

drop function api.atta_in_template_list();

create function api.atta_in_template_list()
returns table (id uuid, kind text, title text, status text, current_version integer, frequency text,
               validity_months smallint, required boolean, clinic_service_ids uuid[], updated_at timestamptz,
               allowed_actions jsonb, clinic_services jsonb, current_version_published_at timestamptz,
               signed_count integer)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_create boolean;
  v_edit boolean;
begin
  if v_tenant is null or not coalesce((select private.has_permission('documents', 'view')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  v_create := coalesce((select private.has_permission('documents', 'create')), false);
  v_edit := coalesce((select private.has_permission('documents', 'edit')), false);

  return query
  select t.id, t.kind, t.title, t.status, t.current_version, t.frequency, t.validity_months, t.required,
         s.ids, t.updated_at,
         coalesce((select jsonb_agg(a.obj order by a.ord) from (values
            (1, case when t.status <> 'inativo' and v_edit
                     then jsonb_build_object('action', 'editar') end),
            (2, case when t.status <> 'inativo' and v_edit and t.kind <> 'termo_de_autorizacao'
                     then jsonb_build_object('action', 'vincular_procedimentos') end),
            (3, case when t.status <> 'inativo' and (case when t.current_version is null then v_create else v_edit end)
                     then case when t.kind <> 'termo_de_autorizacao' and s.vivos = 0
                               then jsonb_build_object('action', 'publicar', 'disabled_reason', 'service_ids')
                               else jsonb_build_object('action', 'publicar') end end),
            (4, case when t.status = 'ativo' and v_edit then jsonb_build_object('action', 'inativar') end)
          ) a (ord, obj) where a.obj is not null), '[]'::jsonb),
         s.servicos,
         (select v.published_at from documents.template_version v
          where v.tenant_id = t.tenant_id and v.template_id = t.id and v.version = t.current_version),
         (select count(*)::integer
          from documents.template_version v
          join documents.document d on d.tenant_id = v.tenant_id and d.template_version_id = v.id
          join documents.evidence e on e.tenant_id = d.tenant_id and e.document_id = d.id
          where v.tenant_id = t.tenant_id and v.template_id = t.id
            and d.status in ('assinado_definitivo', 'substituido'))
  from documents.template t
  cross join lateral (
    select coalesce(array_agg(l.clinic_service_id order by l.clinic_service_id) filter (where c.deleted_at is null), '{}') as ids,
           count(*) filter (where c.deleted_at is null) as vivos,
           coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by lower(c.name), c.id)
                      filter (where c.deleted_at is null), '[]'::jsonb) as servicos
    from atta_in.service_document_template l
    join atta_in.clinic_service c on c.tenant_id = l.tenant_id and c.id = l.clinic_service_id
    where l.tenant_id = t.tenant_id and l.template_id = t.id
  ) s
  where t.tenant_id = v_tenant
  order by t.status = 'inativo', lower(t.title), t.id;
end;
$$;
revoke all on function api.atta_in_template_list() from public, anon, service_role;
grant execute on function api.atta_in_template_list() to authenticated;

-- Cartões do topo de Meus modelos. Termos ativos e a divisão obrigatório/opcional pela versão vigente (RN-DOC-04 vale
-- pela versão publicada). Assinados: documentos da clínica com evidência em Assinado definitivo ou Substituído; "com
-- ATTA Sign": os de nível atta_sign. Ler o nível do JSON é aceito no volume de hoje; quando crescer, vira coluna da
-- evidência (nota do Tech Lead, da Segurança e do Backend 3 no #148).
create function api.atta_in_template_summary()
returns table (active_count integer, active_required_count integer, active_optional_count integer,
               expiring_count integer, expired_count integer, signed_count integer, signed_atta_sign_count integer)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
begin
  if v_tenant is null or not coalesce((select private.has_permission('documents', 'view')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  return query
  select
    (select count(*)::integer from documents.template t where t.tenant_id = v_tenant and t.status = 'ativo'),
    (select count(*)::integer from documents.template t
     join documents.template_version v on v.tenant_id = t.tenant_id and v.template_id = t.id and v.version = t.current_version
     where t.tenant_id = v_tenant and t.status = 'ativo' and v.required),
    (select count(*)::integer from documents.template t
     join documents.template_version v on v.tenant_id = t.tenant_id and v.template_id = t.id and v.version = t.current_version
     where t.tenant_id = v_tenant and t.status = 'ativo' and not v.required),
    null::integer,
    null::integer,
    (select count(*)::integer from documents.evidence e
     join documents.document d on d.tenant_id = e.tenant_id and d.id = e.document_id
     where e.tenant_id = v_tenant and d.status in ('assinado_definitivo', 'substituido')),
    (select count(*)::integer from documents.evidence e
     join documents.document d on d.tenant_id = e.tenant_id and d.id = e.document_id
     where e.tenant_id = v_tenant and d.status in ('assinado_definitivo', 'substituido')
       and pg_catalog.convert_from(e.payload_canonical, 'UTF8')::jsonb #>> '{signature,level}' = 'atta_sign');
end;
$$;
revoke all on function api.atta_in_template_summary() from public, anon, service_role;
grant execute on function api.atta_in_template_summary() to authenticated;
