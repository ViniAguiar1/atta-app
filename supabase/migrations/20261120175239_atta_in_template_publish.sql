-- MIG-20 (parte 3): no ATTA-in, modelo só se publica com pelo menos um procedimento vivo. PDD v206 §10.3.1 ("todo
-- termo deve estar vinculado a um ou mais procedimentos"). Decisão do Tech Lead no #67, na ADR 0001 §1 ("regra de
-- produto sobre ação da plataforma"): a garantia fica no banco, nunca só na tela.
--   - o núcleo da publicação vai para private.template_publish_core (sem EXECUTE para os papéis da API);
--   - api.template_publish (plataforma) continua existindo para os invólucros do Clinic e do Pro, sem EXECUTE para
--     authenticated;
--   - api.atta_in_template_publish confere o vínculo e chama o núcleo;
--   - api.atta_in_template_list devolve os modelos com allowed_actions calculado aqui (a tela não refaz a regra).
-- Também: o detail das recusas de estado passa a ser nome de campo (status, kind), ADR 0001 §5 (Tech Lead, #67).
-- Sempre para a frente.

-- ---------------------------------------------------------------------------------------------------------------
-- Núcleo da publicação (o mesmo do #50; muda só o detail de Inativo para 'status')
-- ---------------------------------------------------------------------------------------------------------------
create function private.template_publish_core(p_template_id uuid)
returns table (template_version_id uuid, version integer, body_sha256 text)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_user uuid := (select auth.uid());
  t documents.template%rowtype;
  v_body text;
  v_version integer;
  v_id uuid;
  v_sha text;
begin
  if v_tenant is null or v_user is null then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  select * into t from documents.template where id = p_template_id and tenant_id = v_tenant for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'template_id';
  end if;
  if not coalesce((select private.has_permission('documents',
                     case when t.current_version is null then 'create' else 'edit' end)), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if t.status = 'inativo' then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0002', detail = 'status';
  end if;
  v_body := private.normalize_document_body(t.draft_body);
  if v_body is null or v_body = '' then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'draft_body';
  end if;
  if t.frequency is null then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'frequency';
  end if;
  if t.required is null then   -- RN-DOC-04: a escolha é obrigatória, sem padrão
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'required';
  end if;
  if exists (select 1 from documents.template_version v
             where v.template_id = t.id and v.version = t.current_version
               and v.body = v_body and v.title = btrim(t.title) and v.kind = t.kind and v.frequency = t.frequency
               and v.validity_months is not distinct from t.validity_months and v.required = t.required) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0002', detail = 'draft_body';
  end if;

  v_version := coalesce(t.current_version, 0) + 1;
  v_sha := encode(sha256(convert_to(v_body, 'UTF8')), 'hex');
  insert into documents.template_version (tenant_id, template_id, version, kind, title, frequency, validity_months,
                                          required, body, body_sha256, published_by)
  values (v_tenant, t.id, v_version, t.kind, btrim(t.title), t.frequency, t.validity_months, t.required, v_body,
          v_sha, v_user)
  returning id into v_id;
  update documents.template set status = 'ativo', current_version = v_version, draft_body = v_body where id = t.id;
  perform audit.record_event('template.publish', 'documents.template_version', v_id,
    jsonb_build_object('template_id', t.id, 'version', v_version),
    jsonb_build_object('current_version', t.current_version, 'status', t.status),
    jsonb_build_object('current_version', v_version, 'status', 'ativo'));
  return query select v_id, v_version, v_sha;
end;
$$;
revoke all on function private.template_publish_core(uuid) from public, anon, authenticated, service_role;

-- a função de plataforma passa a ser só o núcleo, para os invólucros dos produtos; o painel não chama mais direto
create or replace function api.template_publish(p_template_id uuid)
returns table (template_version_id uuid, version integer, body_sha256 text)
language sql volatile security definer set search_path = ''
as $$ select * from private.template_publish_core(p_template_id) $$;
revoke all on function api.template_publish(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- ATTA-in: publica só com pelo menos um procedimento vivo vinculado (o Termo de Autorização do profissional não é
-- de procedimento). Outra clínica e sem permissão saem antes, para a recusa de vínculo não virar oráculo.
-- ---------------------------------------------------------------------------------------------------------------
create function api.atta_in_template_publish(p_template_id uuid)
returns table (template_version_id uuid, version integer, body_sha256 text)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_kind text;
  v_version integer;
begin
  if v_tenant is null then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  select t.kind, t.current_version into v_kind, v_version
  from documents.template t where t.id = p_template_id and t.tenant_id = v_tenant;
  if not found then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'template_id';
  end if;
  if not coalesce((select private.has_permission('documents',
                     case when v_version is null then 'create' else 'edit' end)), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if v_kind <> 'termo_de_autorizacao' and not exists (
       select 1 from atta_in.service_document_template l
       join atta_in.clinic_service c on c.tenant_id = l.tenant_id and c.id = l.clinic_service_id
       where l.tenant_id = v_tenant and l.template_id = p_template_id and c.deleted_at is null) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'service_ids';
  end if;
  return query select * from private.template_publish_core(p_template_id);
end;
$$;
revoke all on function api.atta_in_template_publish(uuid) from public, anon, service_role;
grant execute on function api.atta_in_template_publish(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Lista de Meus modelos com as ações permitidas (ADR 0001 §5: allowed_actions vem do servidor, com o motivo de
-- quando a ação aparece desabilitada). Ações: editar, vincular_procedimentos, publicar, inativar.
-- ---------------------------------------------------------------------------------------------------------------
create function api.atta_in_template_list()
returns table (id uuid, kind text, title text, status text, current_version integer, frequency text,
               validity_months smallint, required boolean, clinic_service_ids uuid[], updated_at timestamptz,
               allowed_actions jsonb)
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
          ) a (ord, obj) where a.obj is not null), '[]'::jsonb)
  from documents.template t
  cross join lateral (
    select coalesce(array_agg(l.clinic_service_id order by l.clinic_service_id), '{}') as ids,
           count(*) filter (where c.deleted_at is null) as vivos
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

-- ---------------------------------------------------------------------------------------------------------------
-- detail das recusas de estado como nome de campo (ADR 0001 §5)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function private.template_guard_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'inativo' then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0002', detail = 'status';
  end if;
  if old.current_version is not null and new.kind is distinct from old.kind then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0002', detail = 'kind';
  end if;
  return new;
end;
$$;

create or replace function api.template_set_services(p_template_id uuid, p_service_ids uuid[])
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
begin
  if v_tenant is null then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  select t.status, t.kind, t.current_version into v_status, v_kind, v_version
  from documents.template t where t.id = p_template_id and t.tenant_id = v_tenant for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'template_id';
  end if;
  if not coalesce((select private.has_permission('documents',
                     case when v_version is null then 'create' else 'edit' end)), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if v_status = 'inativo' then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0002', detail = 'status';
  end if;
  if v_kind = 'termo_de_autorizacao' then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'kind';
  end if;
  select coalesce(array_agg(distinct s order by s), '{}') into v_ids
  from unnest(coalesce(p_service_ids, '{}')) s where s is not null;
  if pg_catalog.cardinality(v_ids) > 50
     or (v_status = 'ativo' and pg_catalog.cardinality(v_ids) = 0) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'service_ids';
  end if;
  if exists (select 1 from unnest(v_ids) s
             where not exists (select 1 from atta_in.clinic_service c
                               where c.id = s and c.tenant_id = v_tenant and c.deleted_at is null)) then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'service_ids';
  end if;
  select coalesce(array_agg(l.clinic_service_id order by l.clinic_service_id), '{}') into v_before
  from atta_in.service_document_template l where l.tenant_id = v_tenant and l.template_id = p_template_id;
  if v_before = v_ids then
    return pg_catalog.cardinality(v_ids);
  end if;
  delete from atta_in.service_document_template l
  where l.tenant_id = v_tenant and l.template_id = p_template_id and l.clinic_service_id <> all (v_ids);
  insert into atta_in.service_document_template (tenant_id, clinic_service_id, template_id)
  select v_tenant, s, p_template_id from unnest(v_ids) s
  on conflict (tenant_id, clinic_service_id, template_id) do nothing;
  perform audit.record_event('template.services_set', 'documents.template', p_template_id, '{}'::jsonb,
    jsonb_build_object('clinic_service_ids', to_jsonb(v_before)),
    jsonb_build_object('clinic_service_ids', to_jsonb(v_ids)));
  return pg_catalog.cardinality(v_ids);
end;
$$;
