-- MIG-21 (parte 1, schema) · ATTA Sign: documento, evidência, selo e objeto cifrado. PDD v206 §17.6 (ciclo de vida),
-- §10.2.3 (termos no Boarding Check, 6 motivos de cancelamento), §18.5 (pacote de evidências), §18.6 (integridade).
-- ADR 0006 (payload JCS, hash, Código ATTA), 0014 (selo Ed25519, manifesto append-only), 0025 (evidência imutável desde
-- o INSERT), 0026 (objeto cifrado com DEK própria) e 0002 (Cofre). As funções de vincular, assinar e concluir vêm nos
-- PRs seguintes; aqui ficam as tabelas, as travas e a RLS. Sempre para a frente.

-- alvo da FK composta do documento (a versão do modelo é da mesma clínica); a tabela é imutável por gatilho de linha,
-- e acrescentar a restrição não toca as linhas
alter table documents.template_version add constraint template_version_tenant_id_uq unique (tenant_id, id);

-- ---------------------------------------------------------------------------------------------------------------
-- Documento: o termo ou documento clínico de um paciente (Pasta) ou o Termo de Autorização de um profissional
-- ---------------------------------------------------------------------------------------------------------------
create table documents.document (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references platform.tenant (id),
  template_version_id  uuid,                      -- nulo só em docs clínicos enviados
  person_id            uuid,                      -- paciente VINCULADO a esta clínica (network.person_tenant_link)
  professional_link_id uuid,                      -- vínculo do profissional com esta clínica (Termo de Autorização)
  folder_section       text check (folder_section in ('termos', 'docs_clinicos')),   -- Pasta do Paciente (RN-FIC-05)
  appointment_id       uuid,                        -- atendimento (atta_in, só o id: plataforma não referencia produto)
  status               text not null default 'aguardando_assinatura' check (status in
                         ('aguardando_assinatura', 'pre_assinado', 'assinado_definitivo', 'recusado', 'cancelado',
                          'substituido')),
  cancel_reason        text check (cancel_reason in ('paciente_desistiu', 'contraindicacao', 'procedimento_substituido',
                         'erro_de_registro', 'indisponibilidade_de_insumo', 'no_show')),   -- os 6 chips do §10.2.3
  cancelled_by         uuid,
  cancelled_at         timestamptz,
  replaced_by_document_id uuid,                   -- §17.6: o definitivo só é substituído por nova emissão
  created_by           uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint document_tenant_id_uq unique (tenant_id, id),
  -- isolamento entre clínicas: tudo o que o documento referencia é da mesma clínica
  constraint document_template_version_fk foreign key (tenant_id, template_version_id)
    references documents.template_version (tenant_id, id),
  constraint document_person_link_fk foreign key (tenant_id, person_id)
    references network.person_tenant_link (tenant_id, person_id),
  constraint document_professional_link_fk foreign key (tenant_id, professional_link_id)
    references platform.professional_tenant_link (tenant_id, id),
  constraint document_replaced_by_fk foreign key (tenant_id, replaced_by_document_id)
    references documents.document (tenant_id, id),
  constraint document_replaced_check check ((status = 'substituido') = (replaced_by_document_id is not null)),
  constraint document_owner_check check (num_nonnulls(person_id, professional_link_id) = 1),
  constraint document_folder_check check ((person_id is null) = (folder_section is null)),
  constraint document_template_check check (template_version_id is not null or folder_section = 'docs_clinicos'),
  constraint document_cancel_check check (
    (status = 'cancelado') = (cancel_reason is not null and cancelled_at is not null))
);
create index document_tenant_person_idx on documents.document (tenant_id, person_id, folder_section)
  where person_id is not null;
create index document_tenant_professional_idx on documents.document (tenant_id, professional_link_id)
  where professional_link_id is not null;
create index document_tenant_appointment_idx on documents.document (tenant_id, appointment_id)
  where appointment_id is not null;
create trigger document_set_updated_at before update on documents.document
  for each row execute function private.set_updated_at();

-- Ciclo de vida só para a frente (§17.6): aguardando → pré-assinado, recusado ou cancelado; pré-assinado → definitivo
-- ou cancelado (lixeira, §10.2.3); o definitivo só é substituído por nova emissão (replaced_by_document_id).
-- Recusado, cancelado e substituído são finais. Ninguém apaga documento.
create function private.document_guard_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0002', detail = 'document_delete';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'aguardando_assinatura' and new.status in ('pre_assinado', 'recusado', 'cancelado'))
    or (old.status = 'pre_assinado' and new.status in ('assinado_definitivo', 'cancelado'))
    or (old.status = 'assinado_definitivo' and new.status = 'substituido')
  ) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0002', detail = 'document_status';
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
revoke all on function private.document_guard_status() from public, anon, authenticated, service_role;
create trigger document_guard_status before update or delete on documents.document
  for each row execute function private.document_guard_status();

-- ---------------------------------------------------------------------------------------------------------------
-- Evidência: os bytes exatos do JCS do payload (não jsonb, que reordena e reescreve número), presos ao hash
-- ---------------------------------------------------------------------------------------------------------------
create table documents.evidence (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  document_id       uuid not null unique,
  atta_sign_version text not null check (atta_sign_version = '1'),
  payload_canonical bytea not null,
  evidence_sha256   text not null,
  atta_code         text not null unique,
  code_nonce        integer not null default 0 check (code_nonce >= 0),   -- colisão → servidor recalcula (ADR 0006 §5)
  signed_at         timestamptz not null,
  created_at        timestamptz not null default now(),
  constraint evidence_tenant_id_uq unique (tenant_id, id),
  constraint evidence_document_fk foreign key (tenant_id, document_id) references documents.document (tenant_id, id),
  constraint evidence_signed_at_ms_check check (signed_at = date_trunc('milliseconds', signed_at)),
  constraint evidence_sha256_check check (evidence_sha256 = encode(sha256(payload_canonical), 'hex')),
  constraint evidence_code_check check (atta_code ~ '^ATTA-[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){2}$'),
  -- o payload declara a mesma versão, e o momento da assinatura é o signature.signed_at DO PRÓPRIO payload, em ms e
  -- ISO UTC (regra do Tech Lead a partir do #61): é esse texto que entra no hash e que o verifySeal recebe
  constraint evidence_payload_check check (
    convert_from(payload_canonical, 'UTF8')::jsonb ->> 'atta_sign_version' = atta_sign_version
    and convert_from(payload_canonical, 'UTF8')::jsonb #>> '{signature,signed_at}'
        = to_char(signed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
create index evidence_tenant_idx on documents.evidence (tenant_id);

-- ---------------------------------------------------------------------------------------------------------------
-- Selo Ed25519 (ADR 0014): manifesto público append-only e um selo por (evidência, chave). A privada não fica no banco.
-- ---------------------------------------------------------------------------------------------------------------
create table documents.seal_key (
  id               uuid primary key default gen_random_uuid(),
  kid              text not null unique check (kid ~ '^(staging-seal-|seal-)[a-z0-9-]{1,60}$'),
  alg              text not null default 'Ed25519' check (alg = 'Ed25519'),
  public_key_spki  bytea not null check (octet_length(public_key_spki) = 44),   -- SPKI DER de uma chave Ed25519
  valid_from       timestamptz not null,
  valid_until      timestamptz,
  created_at       timestamptz not null default now(),
  constraint seal_key_window_check check (valid_until is null or valid_until > valid_from)
);

create table documents.seal (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  evidence_id  uuid not null,
  kid          text not null references documents.seal_key (kid),
  signature    bytea not null check (octet_length(signature) = 64),   -- Ed25519 sobre o evidence_sha256 em ASCII
  created_at   timestamptz not null default now(),
  constraint seal_evidence_kid_uq unique (evidence_id, kid),
  constraint seal_tenant_id_uq unique (tenant_id, id),
  constraint seal_evidence_fk foreign key (tenant_id, evidence_id) references documents.evidence (tenant_id, id)
);
create index seal_tenant_idx on documents.seal (tenant_id);

-- Carimbo do tempo (RFC 3161): fora do MVP (decisão do dono), mas o lugar já existe, aditivo e fora do hash. Vazia.
create table documents.seal_timestamp (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  seal_id     uuid not null,
  kind        text not null check (kind = 'rfc3161'),
  token       bytea not null,
  issuer      text not null,
  created_at  timestamptz not null default now(),
  constraint seal_timestamp_seal_fk foreign key (tenant_id, seal_id) references documents.seal (tenant_id, id)
);

-- ---------------------------------------------------------------------------------------------------------------
-- Objeto no Storage (bucket privado), cifrado no Node com DEK própria pelo Cofre (ADR 0002 e 0026): os PDFs e a
-- imagem da assinatura desenhada (no payload vai só o stroke_sha256). Contexto do Cofre:
-- (tenant_id, 'documents.stored_object', 'content', id).
-- ---------------------------------------------------------------------------------------------------------------
create table documents.stored_object (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  document_id   uuid not null,
  role          text not null check (role in ('body_pdf', 'final_pdf', 'signature_stroke', 'clinical_upload')),
  party_ref     text check (party_ref ~ '^p[0-9]{1,2}$'),   -- de qual parte do payload é a assinatura desenhada
  storage_path  text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[a-z0-9_.-]{1,80}$'),
  sha256_plain  text not null check (sha256_plain ~ '^[0-9a-f]{64}$'),
  size_bytes    integer not null check (size_bytes between 1 and 26214400),   -- até 25 MiB
  dek_wrapped   bytea not null,
  kek_version   smallint not null check (kek_version between 1 and 32767),
  created_at    timestamptz not null default now(),
  constraint stored_object_document_fk foreign key (tenant_id, document_id) references documents.document (tenant_id, id),
  constraint stored_object_stroke_check check ((role = 'signature_stroke') = (party_ref is not null)),
  constraint stored_object_one_uq unique nulls not distinct (document_id, role, party_ref)
);
create index stored_object_tenant_idx on documents.stored_object (tenant_id);

-- ---------------------------------------------------------------------------------------------------------------
-- Imutabilidade desde o INSERT (ADR 0025): evidência, selo, chave, carimbo e objeto não se alteram nem se apagam
-- ---------------------------------------------------------------------------------------------------------------
create function private.reject_evidence_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'ATTA-IN-0002', detail = 'evidence_immutable';
end
$$;
revoke all on function private.reject_evidence_change() from public, anon, authenticated, service_role;

do $$ declare t text; begin
  foreach t in array array['documents.evidence', 'documents.seal', 'documents.seal_timestamp',
                           'documents.stored_object'] loop
    execute format('create trigger append_only before update or delete on %s for each row
                    execute function private.reject_evidence_change()', t);
    execute format('create trigger no_truncate before truncate on %s for each statement
                    execute function private.reject_evidence_change()', t);
  end loop;
  foreach t in array array['documents.document', 'documents.evidence', 'documents.seal', 'documents.seal_key',
                           'documents.seal_timestamp', 'documents.stored_object'] loop
    execute format('alter table %s enable row level security', t);
    execute format('alter table %s force row level security', t);
    execute format('revoke all on %s from public, anon, authenticated, service_role', t);
  end loop;
end $$;
create trigger document_no_truncate before truncate on documents.document
  for each statement execute function private.reject_evidence_change();

-- Manifesto do selo (ADR 0014; rotação e vazamento, ADR 0002 e §19.10): a única mudança aceita é aposentar a chave,
-- uma vez, levando valid_until de nulo para um instante depois do valid_from e não no passado. Nada mais muda, e a
-- chave não se apaga: selo antigo precisa continuar verificável para sempre.
create function private.seal_key_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'UPDATE' then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0002', detail = 'seal_key_immutable';
  end if;
  if (new.id, new.kid, new.alg, new.public_key_spki, new.valid_from, new.created_at)
       is distinct from (old.id, old.kid, old.alg, old.public_key_spki, old.valid_from, old.created_at)
     or old.valid_until is not null
     or new.valid_until is null
     or new.valid_until <= old.valid_from
     or new.valid_until < pg_catalog.now() then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0002', detail = 'seal_key_retire';
  end if;
  return new;
end
$$;
revoke all on function private.seal_key_guard() from public, anon, authenticated, service_role;
create trigger seal_key_guard before update or delete on documents.seal_key
  for each row execute function private.seal_key_guard();
create trigger seal_key_no_truncate before truncate on documents.seal_key
  for each statement execute function private.seal_key_guard();

-- O painel lê o documento (estado, divisória, atendimento) com a permissão de Termos & Docs; a escrita é só por
-- função em api (próximos PRs). Evidência, selo e objeto não têm grant: a leitura também passa por função.
grant select on documents.document to authenticated;
create policy document_select on documents.document for select to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('documents', 'view')));
