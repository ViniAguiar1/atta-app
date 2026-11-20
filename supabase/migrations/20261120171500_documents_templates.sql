-- MIG-20: Meus modelos versionados (PDD v206 §10.3.1, §14.5, §16.5, §17.2 e §17.5; RN-DOC-01, RN-DOC-02, RN-DOC-04,
-- RN-V-01 e RN-V-02). Decisão 0001 §1 e §2: schema `documents` exposto, RLS forçada, has_permission('documents', ...).
--
-- Dois níveis:
--   documents.template          o modelo e o rascunho de trabalho (salvamento automático, §10.3.1). Mutável enquanto
--                               não está Inativo. O que vale para documento novo é sempre a versão publicada.
--   documents.template_version  cada publicação: número sequencial por modelo, texto integral, autor, data e as regras
--                               vigentes (frequência, validade, obrigatório). Nunca muda nem sai (RN-DOC-01, §17.5);
--                               o gatilho recusa UPDATE, DELETE e TRUNCATE inclusive para o dono.
-- O documento do ATTA Sign (MIG-21, Backend 3) referencia template_version(id): o id e o número da versão ficam
-- gravados nele de forma imutável (RN-DOC-02), e o body_sha256 da versão entra no payload (document.body_sha256).
-- Publicar e inativar só por função em `api`, com auditoria. Inativo não volta a Ativo: o PDD não prevê (lacuna levada
-- ao CTO); se a PO definir, entra numa função nova.
-- O vínculo modelo × Serviço mora no produto (atta_in.service_document_template, PR seguinte), porque a plataforma não
-- referencia atta_in (decisão 0001 §1).

-- ---------------------------------------------------------------------------------------------------------------
-- Normalização do texto ("nfc+lf+trim", ADR 0006 e RFC-0017 do atta-platform): fim de linha CRLF e CR viram LF, a
-- forma Unicode vira NFC e saem espaço, tabulação e quebra de linha das pontas. É sobre esse texto que se calcula o
-- body_sha256. Um lugar só: a publicação normaliza com ela, e o CHECK da versão confere com ela. Contrato na ADR 0002
-- §7 (o TS do ATTA Sign usa a mesma regra).
-- O trim tira só [ \t\n], de propósito: NBSP e outros espaços Unicode ficam no texto (o String.trim() do JS e o \s
-- tiram mais e dariam outro hash). O \r já virou \n antes.
-- ---------------------------------------------------------------------------------------------------------------
create function private.normalize_document_body(p_body text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.btrim(
    pg_catalog.normalize(pg_catalog.replace(pg_catalog.replace(p_body, e'\r\n', e'\n'), e'\r', e'\n'), 'NFC'),
    e' \t\n')
$$;
revoke all on function private.normalize_document_body(text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Modelo
-- ---------------------------------------------------------------------------------------------------------------
create table documents.template (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default private.current_tenant_id() references platform.tenant (id),
  -- tipos do §17.2 que a clínica cria (o Aviso de Privacidade e o Termo de Uso do Check-in são da ATTA e ficam fora,
  -- RN-AVP-01) e o Termo de Autorização do profissional (§10.4.3), que o ATTA Sign usa em document.type
  kind            text not null,
  title           text not null,
  -- rascunho de trabalho: pode ficar incompleto até publicar (salvamento automático, §10.3.1)
  frequency       text,
  validity_months smallint,
  required        boolean,          -- RN-DOC-04: obrigatório (true) ou opcional (false), sem valor padrão
  draft_body      text,
  status          text not null default 'rascunho',
  current_version integer,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint template_tenant_id_uq unique (tenant_id, id),
  constraint template_kind_check check (kind in (
    'tcle', 'consentimento_procedimento', 'autorizacao_uso_imagem', 'termo_responsabilidade_cuidados',
    'contrato_prestacao_servicos', 'politica_cancelamento_no_show', 'personalizado', 'termo_de_autorizacao')),
  constraint template_title_check check (length(btrim(title)) between 1 and 200),
  constraint template_frequency_check check (frequency in ('por_procedimento', 'unica')),
  -- §17.2: a frequência é do tipo, salvo nos personalizados (a clínica escolhe) e no Termo de Autorização
  constraint template_kind_frequency_check check (
    frequency is null
    or kind in ('personalizado', 'termo_de_autorizacao')
    or (kind in ('tcle', 'consentimento_procedimento', 'autorizacao_uso_imagem', 'termo_responsabilidade_cuidados')
        and frequency = 'por_procedimento')
    or (kind in ('contrato_prestacao_servicos', 'politica_cancelamento_no_show') and frequency = 'unica')),
  -- RN-V-01: validade só em "Única" (3, 6 ou 12 meses; nulo = indeterminada); "Por procedimento" não tem o campo
  constraint template_validity_check check (
    validity_months is null or (validity_months in (3, 6, 12) and frequency = 'unica')),
  constraint template_draft_body_check check (draft_body is null or length(draft_body) <= 200000),
  constraint template_status_check check (status in ('rascunho', 'ativo', 'inativo')),
  constraint template_published_check check ((status = 'rascunho') = (current_version is null)),
  constraint template_current_version_check check (current_version >= 1)
);
create index template_tenant_status_idx on documents.template (tenant_id, status);

create trigger template_set_updated_at before update on documents.template
  for each row execute function private.set_updated_at();

-- Inativo não aceita edição: não se aplica mais a documento novo (§10.3.1). Depois da 1ª publicação, o tipo não muda:
-- ele vira document.type no payload do ATTA Sign, e um TCLE não pode virar outro tipo de documento na versão seguinte.
create function private.template_guard_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'inativo' then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0002', detail = 'template_inactive';
  end if;
  if old.current_version is not null and new.kind is distinct from old.kind then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0002', detail = 'kind_locked';
  end if;
  return new;
end;
$$;
revoke all on function private.template_guard_edit() from public, anon, authenticated, service_role;
create trigger template_guard_edit before update on documents.template
  for each row execute function private.template_guard_edit();

-- ---------------------------------------------------------------------------------------------------------------
-- Versão publicada (imutável)
-- ---------------------------------------------------------------------------------------------------------------
create table documents.template_version (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  template_id        uuid not null,
  version            integer not null,
  kind               text not null,
  title              text not null,
  frequency          text not null,
  validity_months    smallint,
  required           boolean not null,
  body               text not null,
  body_normalization text not null default 'nfc+lf+trim',
  body_sha256        text not null,
  published_by       uuid not null,
  published_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  constraint template_version_template_fk foreign key (tenant_id, template_id)
    references documents.template (tenant_id, id),
  constraint template_version_number_uq unique (template_id, version),
  constraint template_version_number_check check (version >= 1),
  constraint template_version_frequency_check check (frequency in ('por_procedimento', 'unica')),
  constraint template_version_validity_check check (
    validity_months is null or (validity_months in (3, 6, 12) and frequency = 'unica')),
  constraint template_version_body_check check (
    length(body) between 1 and 200000 and body = private.normalize_document_body(body)),
  constraint template_version_normalization_check check (body_normalization = 'nfc+lf+trim'),
  constraint template_version_sha256_check check (body_sha256 = encode(sha256(convert_to(body, 'UTF8')), 'hex'))
);
create index template_version_tenant_template_idx on documents.template_version (tenant_id, template_id, version);

create function private.reject_template_version_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'ATTA-IN-0002', detail = 'template_version_immutable';
end;
$$;
revoke all on function private.reject_template_version_change() from public, anon, authenticated, service_role;
create trigger template_version_immutable before update or delete on documents.template_version
  for each row execute function private.reject_template_version_change();
create trigger template_version_no_truncate before truncate on documents.template_version
  for each statement execute function private.reject_template_version_change();

-- ---------------------------------------------------------------------------------------------------------------
-- RLS forçada e grants mínimos (decisão 0001 §2). anon não tem nada.
-- ---------------------------------------------------------------------------------------------------------------
alter table documents.template enable row level security;
alter table documents.template force row level security;
alter table documents.template_version enable row level security;
alter table documents.template_version force row level security;

revoke all on documents.template, documents.template_version from public, anon, authenticated, service_role;
-- o rascunho se cria e se edita pela tabela; status e versão só pelas funções de api
grant select on documents.template to authenticated;
grant insert (kind, title, frequency, validity_months, required, draft_body) on documents.template to authenticated;
grant update (kind, title, frequency, validity_months, required, draft_body) on documents.template to authenticated;
grant select on documents.template_version to authenticated;

-- has_permission confere o vínculo ativo no banco e o aal2 do ADMIN (decisão 0001 §2)
create policy template_select on documents.template for select to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('documents', 'view')));
create policy template_insert on documents.template for insert to authenticated
  with check (tenant_id = (select private.current_tenant_id())
              and (select private.has_permission('documents', 'create')));
create policy template_update on documents.template for update to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('documents', 'edit')))
  with check (tenant_id = (select private.current_tenant_id()));

create policy template_version_select on documents.template_version for select to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('documents', 'view')));

-- ---------------------------------------------------------------------------------------------------------------
-- Auditoria (ADR 0003): publicar e inativar são mudança
-- ---------------------------------------------------------------------------------------------------------------
insert into audit.action (action, kind) values
  ('template.publish', 'change'),
  ('template.deactivate', 'change')
on conflict (action) do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- Publicar: o rascunho vira a versão n+1, numa transação só (RN-DOC-01, §17.5). A primeira publicação é criar
-- (has_permission 'create'); as seguintes são editar ('edit'). Outra clínica e modelo inexistente: "não encontrado".
-- ---------------------------------------------------------------------------------------------------------------
create function api.template_publish(p_template_id uuid)
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

  select * into t from documents.template
  where id = p_template_id and tenant_id = v_tenant
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'template_id';
  end if;
  if not coalesce((select private.has_permission('documents',
                     case when t.current_version is null then 'create' else 'edit' end)), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if t.status = 'inativo' then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0002', detail = 'template_inactive';
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

  -- nada mudou desde a última versão: não nasce versão nova
  if exists (select 1 from documents.template_version v
             where v.template_id = t.id and v.version = t.current_version
               and v.body = v_body and v.title = btrim(t.title) and v.kind = t.kind and v.frequency = t.frequency
               and v.validity_months is not distinct from t.validity_months and v.required = t.required) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0002', detail = 'unchanged';
  end if;

  v_version := coalesce(t.current_version, 0) + 1;
  v_sha := encode(sha256(convert_to(v_body, 'UTF8')), 'hex');
  insert into documents.template_version (tenant_id, template_id, version, kind, title, frequency, validity_months,
                                          required, body, body_sha256, published_by)
  values (v_tenant, t.id, v_version, t.kind, btrim(t.title), t.frequency, t.validity_months, t.required, v_body,
          v_sha, v_user)
  returning id into v_id;

  update documents.template set status = 'ativo', current_version = v_version, draft_body = v_body
  where id = t.id;

  perform audit.record_event('template.publish', 'documents.template_version', v_id,
    jsonb_build_object('template_id', t.id, 'version', v_version),
    jsonb_build_object('current_version', t.current_version, 'status', t.status),
    jsonb_build_object('current_version', v_version, 'status', 'ativo'));

  return query select v_id, v_version, v_sha;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Inativar: Ativo → Inativo. Documentos já emitidos continuam válidos e consultáveis (§10.3.1).
-- ---------------------------------------------------------------------------------------------------------------
create function api.template_deactivate(p_template_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_status text;
begin
  if v_tenant is null or not coalesce((select private.has_permission('documents', 'edit')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  select status into v_status from documents.template
  where id = p_template_id and tenant_id = v_tenant
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'template_id';
  end if;
  if v_status <> 'ativo' then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0002', detail = 'status';
  end if;

  update documents.template set status = 'inativo' where id = p_template_id;
  perform audit.record_event('template.deactivate', 'documents.template', p_template_id, '{}'::jsonb,
    '{"status":"ativo"}'::jsonb, '{"status":"inativo"}'::jsonb);
end;
$$;

revoke all on function api.template_publish(uuid), api.template_deactivate(uuid) from public, anon, service_role;
grant execute on function api.template_publish(uuid), api.template_deactivate(uuid) to authenticated;
