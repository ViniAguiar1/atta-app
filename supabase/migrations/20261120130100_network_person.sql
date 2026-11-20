-- MIG-12 (parte a): pessoa por CPF na rede, vínculo com a clínica, verificação, provisório de importação e divergência.
--
-- Schema de PLATAFORMA e FECHADO (decisão 0001 §1; ADR 0005): o Clinic e o Pro leem sem migrar, e ninguém chega aqui
-- pela Data API. Sem USAGE para anon e authenticated; o painel lê e grava só pelas funções em api (MIG-12, parte b).
-- O banco não calcula HMAC, não cifra e não mascara (ADR 0002 §6): o servidor do Next manda cpf_hmac, cpf_masked e os
-- campos *_enc (formato 1, um envelope por linha: dek_wrapped + kek_version, AAD tenant|tabela|coluna|id).
-- Regras do PDD v206: RN-PAC-01 (um cadastro ativo por CPF na clínica), RN-PAC-02 (estrangeiro com RNE, RNM ou CRNM,
-- decisão do dono em 20/11; sem CPF =
-- incompleto), RN-PAC-05 e 06 (selo só pela ATTA, vale 1 ano), RN-PAC-08 (divergência só se reporta).

-- ---------------------------------------------------------------------------------------------------------------
-- Pessoa (global: sem tenant). Identidade por CPF ou RNE, nunca em claro para consulta.
-- ---------------------------------------------------------------------------------------------------------------
create table network.person (
  id uuid primary key default gen_random_uuid(),
  cpf_hmac bytea unique,
  cpf_masked text,
  cpf_enc bytea,
  foreign_doc_type text,                -- estrangeiro: RNE, RNM ou CRNM, sem dígito verificador (dono, 20/11)
  foreign_doc_hmac bytea,
  foreign_doc_masked text,
  foreign_doc_enc bytea,
  full_name text not null,
  social_name text,
  birth_date date,
  phone_enc bytea,
  email_enc bytea,
  dek_wrapped bytea,
  kek_version smallint,
  is_incomplete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint person_full_name_check check (length(btrim(full_name)) between 2 and 200),
  constraint person_social_name_check check (social_name is null or length(btrim(social_name)) between 2 and 200),
  constraint person_identifier_check check (cpf_hmac is not null or foreign_doc_hmac is not null or is_incomplete),
  constraint person_cpf_triple_check check (num_nulls(cpf_hmac, cpf_masked, cpf_enc) in (0, 3)),
  constraint person_foreign_doc_check check (num_nulls(foreign_doc_type, foreign_doc_hmac, foreign_doc_masked,
    foreign_doc_enc) in (0, 4)),
  constraint person_foreign_doc_type_check check (foreign_doc_type in ('rne', 'rnm', 'crnm')),
  -- o mesmo número em tipos diferentes (RNE e RNM) são documentos diferentes (Tech Lead, revisão do #8)
  constraint person_foreign_doc_unique unique (foreign_doc_type, foreign_doc_hmac),
  constraint person_hmac_size_check check (
    (cpf_hmac is null or octet_length(cpf_hmac) = 32)
    and (foreign_doc_hmac is null or octet_length(foreign_doc_hmac) = 32)),
  constraint person_envelope_check check (
    (num_nonnulls(cpf_enc, foreign_doc_enc, phone_enc, email_enc) = 0) = (dek_wrapped is null)
    and (dek_wrapped is null) = (kek_version is null)),
  constraint person_birth_date_check check (birth_date is null or birth_date >= date '1900-01-01')   -- data futura: api
);

-- ---------------------------------------------------------------------------------------------------------------
-- Vínculo pessoa × clínica: no máximo um cadastro ativo por pessoa na clínica (RN-PAC-01)
-- ---------------------------------------------------------------------------------------------------------------
create table network.person_tenant_link (
  tenant_id uuid not null references platform.tenant (id),
  person_id uuid not null references network.person (id),
  origin text not null default 'recepcao',
  linked_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  primary key (tenant_id, person_id),
  constraint person_tenant_link_origin_check check (origin in ('recepcao', 'atta_me', 'importacao'))
);
create index person_tenant_link_person_idx on network.person_tenant_link (person_id);

-- ---------------------------------------------------------------------------------------------------------------
-- Verificação de identidade: só a ATTA grava, a partir do ATTA me; a clínica nunca (RN-PAC-05). Sem imagem.
-- ---------------------------------------------------------------------------------------------------------------
create table network.identity_verification (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references network.person (id),
  verified_at timestamptz not null,
  expires_at timestamptz not null,
  proof_hash bytea not null,
  result text not null,
  created_at timestamptz not null default now(),
  constraint identity_verification_result_check check (result in ('aprovada', 'reprovada')),
  constraint identity_verification_expiry_check check (expires_at > verified_at
    and expires_at <= verified_at + interval '1 year')
);
create index identity_verification_person_idx on network.identity_verification (person_id, expires_at desc);

-- ---------------------------------------------------------------------------------------------------------------
-- Provisório de importação (ADR 0021): a INT escreve no MIG-34; aqui só a forma e a RLS
-- ---------------------------------------------------------------------------------------------------------------
create table network.person_import_provisional (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenant (id),
  import_batch_id uuid not null,
  -- sem CPF não importa (PDD 10.1; INT, revisão do #8)
  cpf_hmac bytea not null,
  cpf_masked text not null,
  cpf_enc bytea not null,
  full_name text not null,
  birth_date date,
  phone_enc bytea,
  email_enc bytea,
  dek_wrapped bytea not null,
  kek_version smallint not null,
  status text not null default 'pendente',
  created_at timestamptz not null default now(),
  constraint person_import_provisional_status_check check (status in ('pendente', 'confirmado', 'descartado')),
  constraint person_import_provisional_hmac_size_check check (octet_length(cpf_hmac) = 32)
);
-- o mesmo CPF não entra duas vezes vivo na importação da mesma clínica; descartado libera
create unique index person_import_provisional_cpf_uidx on network.person_import_provisional (tenant_id, cpf_hmac)
  where status <> 'descartado';
create index person_import_provisional_tenant_idx on network.person_import_provisional (tenant_id, import_batch_id);

-- ---------------------------------------------------------------------------------------------------------------
-- Divergência reportada pela clínica ao time da ATTA (RN-PAC-08): nunca bloqueia o atendimento
-- ---------------------------------------------------------------------------------------------------------------
create table network.divergence_report (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenant (id),
  person_id uuid not null references network.person (id),
  -- lista fechada, sem texto livre (dono, 20/11): nome, data de nascimento, CPF que não é do paciente, outro
  reason text not null,
  reported_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint divergence_report_reason_check check (reason in ('nome_nao_confere', 'data_nascimento_nao_confere',
    'cpf_nao_e_do_paciente', 'outro'))
);
create index divergence_report_tenant_idx on network.divergence_report (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------------------------------------------
-- RLS ligada e forçada em tudo, mesmo fechado (decisão 0001 §2). Nenhum grant e nenhuma policy para anon e
-- authenticated: o acesso é só pelas funções SECURITY DEFINER em api, que conferem tenant e vínculo por dentro. Se um
-- dia o schema for aberto por engano, sem policy nada passa (falha fechada).
-- ---------------------------------------------------------------------------------------------------------------
alter table network.person enable row level security;
alter table network.person force row level security;
alter table network.person_tenant_link enable row level security;
alter table network.person_tenant_link force row level security;
alter table network.identity_verification enable row level security;
alter table network.identity_verification force row level security;
alter table network.person_import_provisional enable row level security;
alter table network.person_import_provisional force row level security;
alter table network.divergence_report enable row level security;
alter table network.divergence_report force row level security;

revoke all on all tables in schema network from public, anon, authenticated;
