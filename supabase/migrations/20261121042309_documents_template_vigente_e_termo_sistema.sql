-- MIG-20 (parte 6): a lista de Meus modelos passa a trazer a regra da VERSÃO VIGENTE, além da do rascunho. PDD v206
-- RN-DOC-01 (modelo publicado não é editável; a mudança vale só depois de publicar a versão nova) e RN-DOC-04
-- (obrigatório ou opcional é da versão). Até aqui, required/frequency/validity_months vinham do rascunho
-- (documents.template), e num Ativo editado sem publicar a tela mostrava a regra que ainda não vale (defeito do #69,
-- achado na revisão do #144). Colunas novas no fim, nulas em Rascunho:
--   current_required, current_frequency, current_validity_months (de documents.template_version na current_version).
-- As colunas do rascunho continuam (a tela de edição as usa). A tela usa current_* em Ativo e Inativo.
-- A lista muda de forma, então sai e volta com o mesmo nome e grants.
--
-- No mesmo PR (a lista é a mesma função; sem pilha): o Termo de Autorização do profissional vira modelo de SISTEMA
-- (decisão do CTO, PLANO "Regras de negócio" P2c; ADR 0001 §1). A ATTA publica por seed em cada clínica (Backend 3,
-- MIG-21c), igual para todas; a clínica não cria, não edita, não inativa nem publica esse kind:
--   - gatilho em documents.template recusa INSERT e UPDATE desse kind quando há usuário no token ou quem escreve não
--     é o dono: qualquer caminho da clínica cai nele, inclusive função SECURITY DEFINER; o seed por migration (dono,
--     sem token) passa;
--   - as funções SECURITY DEFINER que mexem no modelo (publicar e inativar) recusam o kind explicitamente, porque
--     dentro delas a sessão já é o dono; o template_set_services já recusava;
--   - a lista mostra o termo sem ação nenhuma (allowed_actions vazio).
-- Recusa: P0001, ATTA-IN-0003, detail 'kind'. Sempre para a frente.

drop function api.atta_in_template_list();

create function api.atta_in_template_list()
returns table (id uuid, kind text, title text, status text, current_version integer, frequency text,
               validity_months smallint, required boolean, clinic_service_ids uuid[], updated_at timestamptz,
               allowed_actions jsonb, clinic_services jsonb, current_version_published_at timestamptz,
               signed_count integer, current_required boolean, current_frequency text,
               current_validity_months smallint)
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
         case when t.kind = 'termo_de_autorizacao' then '[]'::jsonb else   -- modelo de sistema: só leitura (P2c)
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
          ) a (ord, obj) where a.obj is not null), '[]'::jsonb) end,
         s.servicos,
         cv.published_at,
         (select count(*)::integer
          from documents.template_version v
          join documents.document d on d.tenant_id = v.tenant_id and d.template_version_id = v.id
          join documents.evidence e on e.tenant_id = d.tenant_id and e.document_id = d.id
          where v.tenant_id = t.tenant_id and v.template_id = t.id
            and d.status in ('assinado_definitivo', 'substituido')),
         cv.required,
         cv.frequency,
         cv.validity_months
  from documents.template t
  -- a versão vigente: é a regra que vale (RN-DOC-01, RN-DOC-04); o rascunho pode estar editado e não publicado
  left join lateral (
    select v.published_at, v.required, v.frequency, v.validity_months
    from documents.template_version v
    where v.tenant_id = t.tenant_id and v.template_id = t.id and v.version = t.current_version
  ) cv on true
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

-- ---------------------------------------------------------------------------------------------------------------
-- Termo de Autorização do profissional: modelo de sistema (P2c)
-- ---------------------------------------------------------------------------------------------------------------
create function private.template_system_kind_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Recusa quando há usuário no token (qualquer caminho: tabela ou função SECURITY DEFINER, dentro da qual o
  -- current_user já é o dono) ou quando quem escreve não é o dono. O seed por migration e os jobs sem token passam.
  -- (Tech Lead no #188: só current_user deixaria uma função nova furar a regra.)
  if (current_user <> 'postgres' or (select auth.uid()) is not null)
     and (new.kind = 'termo_de_autorizacao' or (tg_op = 'UPDATE' and old.kind = 'termo_de_autorizacao')) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'kind';
  end if;
  return new;
end;
$$;
revoke all on function private.template_system_kind_guard() from public, anon, authenticated, service_role;
create trigger template_system_kind_guard before insert or update on documents.template
  for each row execute function private.template_system_kind_guard();

create or replace function private.template_publish_core(p_template_id uuid)
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
  -- Termo de Autorização do profissional: modelo de sistema, publicado pela ATTA por migration (P2c)
  if t.kind = 'termo_de_autorizacao' then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'kind';
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

create or replace function api.template_deactivate(p_template_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_status text;
  v_kind text;
begin
  if v_tenant is null or not coalesce((select private.has_permission('documents', 'edit')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  select status, kind into v_status, v_kind from documents.template
  where id = p_template_id and tenant_id = v_tenant
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'template_id';
  end if;
  if v_kind = 'termo_de_autorizacao' then   -- modelo de sistema (P2c)
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'kind';
  end if;
  if v_status <> 'ativo' then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0002', detail = 'status';
  end if;

  update documents.template set status = 'inativo' where id = p_template_id;
  perform audit.record_event('template.deactivate', 'documents.template', p_template_id, '{}'::jsonb,
    '{"status":"ativo"}'::jsonb, '{"status":"inativo"}'::jsonb);
end;
$$;
