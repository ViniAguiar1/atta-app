-- MIG-14a (parte 1): profissional de saúde como dado de PLATAFORMA (o Clinic e o Pro usam) e o vínculo com a clínica.
--
-- PDD v206 §10.4.3: o profissional não faz login; é identificado pelo conselho, pela UF e pelo número de registro
-- (lista aceita: CRM, CRO, CRBM, COREN, CREFITO, CRN, CFP e Registro de Esteticista ou equivalente). Decisões do Tech
-- Lead (ADR 0001 §1, 20/11): tabela própria (não aponta para network.person), sem login e sem pending. Global fica só
-- a identidade pública (nome de exibição e o trio do conselho, que é registro público) e o CPF cifrado (cpf_hmac,
-- cpf_masked, cpf_enc). O reaproveitamento é só pelo conselho; o CPF não reaproveita nem revela quem é. O contato é
-- por clínica, no vínculo, com envelope próprio (AAD tenant_id|platform.professional_tenant_link|<coluna>|<envelope_id>,
-- envelope_id gerado pelo servidor antes do cadastro): é para esse telefone que vai o link do Boarding Check. O CPF
-- mascarado só volta à clínica que criou o profissional. O schema platform é exposto, então coluna sensível vai cifrada
-- E fora do grant, e sai só por api.*, com auditoria. O PROpass (MIG-14b) vem depois.

-- ---------------------------------------------------------------------------------------------------------------
-- Profissional (global)
-- ---------------------------------------------------------------------------------------------------------------
create table platform.professional (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  council text not null,
  council_uf text not null,
  council_number text not null,
  cpf_hmac bytea,
  cpf_masked text,
  cpf_enc bytea,
  dek_wrapped bytea,                -- envelope do CPF (AAD platform.professional|cpf_enc|<id>)
  kek_version smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint professional_display_name_check check (length(btrim(display_name)) between 2 and 200),
  constraint professional_council_check check (council in
    ('crm', 'cro', 'crbm', 'coren', 'crefito', 'crn', 'cfp', 'esteticista_ou_equivalente')),
  constraint professional_council_uf_check check (council_uf ~ '^[A-Z]{2}$'),
  constraint professional_council_number_check check (council_number ~ '^[0-9A-Za-z./-]{1,20}$'),
  constraint professional_council_uq unique (council, council_uf, council_number),
  constraint professional_cpf_triple_check check (num_nulls(cpf_hmac, cpf_masked, cpf_enc) in (0, 3)),
  constraint professional_cpf_hmac_size_check check (cpf_hmac is null or octet_length(cpf_hmac) = 32),
  constraint professional_envelope_check check (
    (cpf_enc is null) = (dek_wrapped is null) and (dek_wrapped is null) = (kek_version is null))
);
create unique index professional_cpf_hmac_uq on platform.professional (cpf_hmac) where cpf_hmac is not null;

-- ---------------------------------------------------------------------------------------------------------------
-- Vínculo profissional × clínica (a agenda confere se está ativo)
-- ---------------------------------------------------------------------------------------------------------------
create table platform.professional_tenant_link (
  tenant_id uuid not null references platform.tenant (id),
  professional_id uuid not null references platform.professional (id),
  active boolean not null default true,
  created_by_tenant boolean not null default false,   -- esta clínica criou o profissional: só ela vê o CPF mascarado
  -- contato que esta clínica conhece, com envelope do vínculo (o link do Boarding Check vai para este telefone)
  envelope_id uuid,
  phone_enc bytea,
  email_enc bytea,
  dek_wrapped bytea,
  kek_version smallint,
  linked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, professional_id),
  constraint professional_tenant_link_envelope_check check (
    num_nulls(envelope_id, dek_wrapped, kek_version) in (0, 3)
    and (num_nonnulls(phone_enc, email_enc) = 0) = (dek_wrapped is null))
);
create unique index professional_tenant_link_creator_uq on platform.professional_tenant_link (professional_id)
  where created_by_tenant;
create index professional_tenant_link_professional_idx on platform.professional_tenant_link (professional_id);

-- ---------------------------------------------------------------------------------------------------------------
-- RLS forçada; grant por coluna no profissional (só o que não é sensível)
-- ---------------------------------------------------------------------------------------------------------------
alter table platform.professional enable row level security;
alter table platform.professional force row level security;
alter table platform.professional_tenant_link enable row level security;
alter table platform.professional_tenant_link force row level security;

revoke all on platform.professional from public, anon, authenticated;
grant select (id, display_name, council, council_uf, council_number, created_at, updated_at)
  on platform.professional to authenticated;
revoke all on platform.professional_tenant_link from public, anon, authenticated;
grant select (tenant_id, professional_id, active, linked_at, updated_at)
  on platform.professional_tenant_link to authenticated;   -- contato só por api.*; escrita só por api.*

-- a clínica vê só os profissionais vinculados a ela (ativos ou não), e só quem pode ver a agenda ou a equipe
create policy professional_select on platform.professional for select to authenticated
  using (exists (select 1 from platform.professional_tenant_link l
                 where l.professional_id = professional.id and l.tenant_id = (select private.current_tenant_id()))
         and ((select private.has_permission('appointments', 'view')) or (select private.has_permission('team', 'view'))));
create policy professional_tenant_link_select on platform.professional_tenant_link for select to authenticated
  using (tenant_id = (select private.current_tenant_id())
         and ((select private.has_permission('appointments', 'view')) or (select private.has_permission('team', 'view'))));

-- ---------------------------------------------------------------------------------------------------------------
-- api: cadastro (reaproveita pelo registro no conselho, sem revelar), leitura do contato e ativar/desativar
-- ---------------------------------------------------------------------------------------------------------------
insert into audit.action (action, kind) values
  ('professional.register', 'change'),
  ('professional.read', 'access'),
  ('professional.set_active', 'change'),
  ('professional.set_contact', 'change')
on conflict (action) do nothing;

create function api.professional_register(
  p_id uuid,                        -- gerado no servidor: entra na AAD do envelope
  p_display_name text,
  p_council text,
  p_council_uf text,
  p_council_number text,
  p_cpf_hmac bytea default null,
  p_cpf_masked text default null,
  p_cpf_enc bytea default null,
  p_dek_wrapped bytea default null,   -- envelope do CPF (pessoa global)
  p_kek_version smallint default null,
  -- contato desta clínica, cifrado com o envelope do vínculo (envelope_id gerado pelo servidor antes do cadastro)
  p_envelope_id uuid default null,
  p_phone_enc bytea default null,
  p_email_enc bytea default null,
  p_link_dek_wrapped bytea default null,
  p_link_kek_version smallint default null
) returns table (professional_id uuid, reused boolean)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_existing uuid;
begin
  if v_tenant is null or not coalesce((select private.has_permission('team', 'edit')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if (num_nonnulls(p_phone_enc, p_email_enc) = 0)
       <> (num_nonnulls(p_envelope_id, p_link_dek_wrapped, p_link_kek_version) = 0)
     or num_nonnulls(p_envelope_id, p_link_dek_wrapped, p_link_kek_version) not in (0, 3) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'envelope';
  end if;
  -- o mesmo registro no conselho (público) é o mesmo profissional em toda a rede; o dado dele não é revelado nem
  -- sobrescrito. O CPF não reaproveita: se bater com outro profissional, erro genérico, sem dizer quem é.
  select p.id into v_existing from platform.professional p
  where (p.council, p.council_uf, p.council_number) = (lower(p_council), upper(p_council_uf), btrim(p_council_number));
  if v_existing is null and p_cpf_hmac is not null
     and exists (select 1 from platform.professional p where p.cpf_hmac = p_cpf_hmac) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'cpf';
  end if;
  if v_existing is not null then
    if exists (select 1 from platform.professional_tenant_link l
               where l.tenant_id = v_tenant and l.professional_id = v_existing) then
      raise exception using errcode = '23505', message = 'ATTA-IN-0002', detail = 'council_number';
    end if;
    insert into platform.professional_tenant_link (tenant_id, professional_id, created_by_tenant, envelope_id, phone_enc,
                                                   email_enc, dek_wrapped, kek_version)
    values (v_tenant, v_existing, false, p_envelope_id, p_phone_enc, p_email_enc, p_link_dek_wrapped,
            p_link_kek_version);
    perform audit.record_event('professional.register', 'platform.professional', v_existing,
      jsonb_build_object('reused', true));
    return query select v_existing, true;
    return;
  end if;
  insert into platform.professional (id, display_name, council, council_uf, council_number, cpf_hmac, cpf_masked,
                                     cpf_enc, dek_wrapped, kek_version)
  values (p_id, btrim(p_display_name), lower(p_council), upper(p_council_uf), btrim(p_council_number), p_cpf_hmac,
          p_cpf_masked, p_cpf_enc, p_dek_wrapped, p_kek_version);
  insert into platform.professional_tenant_link (tenant_id, professional_id, created_by_tenant, envelope_id, phone_enc,
                                                 email_enc, dek_wrapped, kek_version)
  values (v_tenant, p_id, true, p_envelope_id, p_phone_enc, p_email_enc, p_link_dek_wrapped, p_link_kek_version);
  perform audit.record_event('professional.register', 'platform.professional', p_id, jsonb_build_object('reused', false));
  return query select p_id, false;
end;
$$;

create function api.professional_get(p_professional_id uuid)
returns table (professional_id uuid, display_name text, council text, council_uf text, council_number text,
               cpf_masked text, phone_enc bytea, email_enc bytea, envelope_id uuid, dek_wrapped bytea,
               kek_version smallint, active boolean)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid := (select private.current_tenant_id());
begin
  if v_tenant is null or not coalesce((select private.has_permission('team', 'view')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  return query
  -- CPF mascarado só para a clínica que criou; contato e envelope do próprio vínculo
  select p.id, p.display_name, p.council, p.council_uf, p.council_number,
         case when l.created_by_tenant then p.cpf_masked end, l.phone_enc, l.email_enc, l.envelope_id, l.dek_wrapped,
         l.kek_version, l.active
  from platform.professional_tenant_link l
  join platform.professional p on p.id = l.professional_id
  where l.tenant_id = v_tenant and l.professional_id = p_professional_id and p.deleted_at is null;
  if not found then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'professional_id';
  end if;
  perform audit.record_event('professional.read', 'platform.professional', p_professional_id, '{}');
end;
$$;

create function api.professional_set_active(p_professional_id uuid, p_active boolean) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_old boolean;
begin
  if v_tenant is null or not coalesce((select private.has_permission('team', 'edit')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  select l.active into v_old from platform.professional_tenant_link l
  where l.tenant_id = v_tenant and l.professional_id = p_professional_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'professional_id';
  end if;
  if v_old is distinct from p_active then
    update platform.professional_tenant_link l set active = p_active, updated_at = now()
    where l.tenant_id = v_tenant and l.professional_id = p_professional_id;
    perform audit.record_event('professional.set_active', 'platform.professional_tenant_link', p_professional_id, '{}',
      jsonb_build_object('active', v_old), jsonb_build_object('active', p_active));
  end if;
end;
$$;

-- troca do contato desta clínica: o envelope do vínculo nasce no primeiro contato e depois não muda
create function api.professional_set_contact(
  p_professional_id uuid,
  p_phone_enc bytea default null,
  p_email_enc bytea default null,
  p_envelope_id uuid default null,
  p_dek_wrapped bytea default null,
  p_kek_version smallint default null
) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_link platform.professional_tenant_link;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
begin
  if v_tenant is null or not coalesce((select private.has_permission('team', 'edit')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  select * into v_link from platform.professional_tenant_link l
  where l.tenant_id = v_tenant and l.professional_id = p_professional_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'professional_id';
  end if;
  if num_nonnulls(p_phone_enc, p_email_enc) = 0
     or num_nonnulls(p_envelope_id, p_dek_wrapped, p_kek_version) not in (0, 3)
     or (p_dek_wrapped is not null and v_link.dek_wrapped is not null)
     or (p_dek_wrapped is null and v_link.dek_wrapped is null) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'envelope';
  end if;
  update platform.professional_tenant_link l set
    phone_enc = coalesce(p_phone_enc, l.phone_enc),
    email_enc = coalesce(p_email_enc, l.email_enc),
    envelope_id = coalesce(l.envelope_id, p_envelope_id),
    dek_wrapped = coalesce(l.dek_wrapped, p_dek_wrapped),
    kek_version = coalesce(l.kek_version, p_kek_version),
    updated_at = now()
  where l.tenant_id = v_tenant and l.professional_id = p_professional_id;
  if p_phone_enc is not null and p_phone_enc is distinct from v_link.phone_enc then
    v_before := v_before || jsonb_build_object('phone_enc', encode(v_link.phone_enc, 'base64'));
    v_after := v_after || jsonb_build_object('phone_enc', encode(p_phone_enc, 'base64'));
  end if;
  if p_email_enc is not null and p_email_enc is distinct from v_link.email_enc then
    v_before := v_before || jsonb_build_object('email_enc', encode(v_link.email_enc, 'base64'));
    v_after := v_after || jsonb_build_object('email_enc', encode(p_email_enc, 'base64'));
  end if;
  perform audit.record_event('professional.set_contact', 'platform.professional_tenant_link', p_professional_id, '{}',
    v_before, v_after);
end;
$$;

revoke all on function api.professional_register(uuid, text, text, text, text, bytea, text, bytea, bytea, smallint, uuid,
                                                 bytea, bytea, bytea, smallint) from public, anon;
revoke all on function api.professional_set_contact(uuid, bytea, bytea, uuid, bytea, smallint) from public, anon;
revoke all on function api.professional_get(uuid) from public, anon;
revoke all on function api.professional_set_active(uuid, boolean) from public, anon;
grant execute on function api.professional_register(uuid, text, text, text, text, bytea, text, bytea, bytea, smallint, uuid,
                                                    bytea, bytea, bytea, smallint) to authenticated;
grant execute on function api.professional_set_contact(uuid, bytea, bytea, uuid, bytea, smallint) to authenticated;
grant execute on function api.professional_get(uuid) to authenticated;
grant execute on function api.professional_set_active(uuid, boolean) to authenticated;
