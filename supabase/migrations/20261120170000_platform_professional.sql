-- MIG-14a (parte 1): profissional de saúde como dado de PLATAFORMA (o Clinic e o Pro usam) e o vínculo com a clínica.
--
-- PDD v206 §10.4.3 (texto literal em Shared/atta/migracao/pdd/pdd-10-4-3-equipe.md): o profissional não faz login;
-- "ao ser cadastrado, recebe e-mail com link do PROpass exclusivo", e "o convite por e-mail leva o próprio profissional
-- a uma tela de auto-preenchimento (não é a clínica que preenche os dados dele)": nome completo, e-mail profissional
-- (travado, o mesmo do convite), CPF, conselho + número de registro + UF e WhatsApp de contato. Por isso (Regra nº 1;
-- ADR 0001 §1 revista):
--   - a clínica informa só o e-mail do convite, que fica no vínculo, cifrado, com envelope próprio
--     (AAD tenant_id|platform.professional_tenant_link|invite_email_enc|<envelope_id>, envelope_id gerado no servidor);
--   - platform.professional (global) é gravado só pelo PROpass (MIG-14b), com os dados do próprio profissional, e o
--     vínculo é ligado a ele ali; conselho que já existe liga ao profissional existente, sem revelar nada;
--   - o vínculo tem chave própria (id): horários, pausas, Serviços autorizados e ausências (atta_in) apontam para ele,
--     e a clínica configura a agenda antes do PROpass;
--   - a clínica vê do profissional o que a lista da §10.4.3 mostra (nome, conselho e registro, WhatsApp/e-mail); CPF
--     só mascarado, e tudo isso só depois do PROpass. Antes dele, só o e-mail do convite.
-- Ações do PDD aqui: cadastrar (convite), Reenviar Link (com troca do e-mail enquanto o PROpass não foi feito), Editar
-- (o mesmo) e Excluir. Revogar autorização e o termo são do MIG-14b e do Backend 3.

-- ---------------------------------------------------------------------------------------------------------------
-- Profissional (global): só o PROpass grava (MIG-14b)
-- ---------------------------------------------------------------------------------------------------------------
create table platform.professional (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  council text not null,
  council_uf text not null,
  council_number text not null,
  cpf_hmac bytea not null,
  cpf_masked text not null,
  cpf_enc bytea not null,
  phone_enc bytea,                    -- WhatsApp de contato, informado pelo profissional (link do Boarding Check)
  email_enc bytea not null,           -- e-mail profissional, travado no do convite
  dek_wrapped bytea not null,         -- envelope do profissional (AAD platform.professional|<coluna>|<id>)
  kek_version smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint professional_display_name_check check (length(btrim(display_name)) between 2 and 200),
  constraint professional_council_check check (council in
    ('crm', 'cro', 'crbm', 'coren', 'crefito', 'crn', 'cfp', 'esteticista_ou_equivalente')),
  constraint professional_council_uf_check check (council_uf ~ '^[A-Z]{2}$'),
  constraint professional_council_number_check check (council_number ~ '^[0-9A-Za-z./-]{1,20}$'),
  constraint professional_council_uq unique (council, council_uf, council_number),
  constraint professional_cpf_hmac_size_check check (octet_length(cpf_hmac) = 32),
  constraint professional_cpf_hmac_uq unique (cpf_hmac)
);

-- ---------------------------------------------------------------------------------------------------------------
-- Vínculo profissional × clínica: nasce no convite, liga ao profissional no PROpass
-- ---------------------------------------------------------------------------------------------------------------
create table platform.professional_tenant_link (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenant (id),
  professional_id uuid references platform.professional (id),   -- nulo até o PROpass
  invite_email_hmac bytea not null,   -- HMAC do e-mail normalizado (servidor): o mesmo e-mail não é convidado duas vezes
  invite_email_enc bytea not null,
  envelope_id uuid not null,
  dek_wrapped bytea not null,
  kek_version smallint not null,
  invited_at timestamptz not null default now(),
  propass_completed_at timestamptz,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint professional_tenant_link_tenant_id_uq unique (tenant_id, id),       -- alvo das FKs da agenda
  constraint professional_tenant_link_email_hmac_size_check check (octet_length(invite_email_hmac) = 32),
  constraint professional_tenant_link_propass_check check ((professional_id is null) = (propass_completed_at is null))
);
create unique index professional_tenant_link_professional_uq on platform.professional_tenant_link (tenant_id, professional_id)
  where professional_id is not null and deleted_at is null;
create unique index professional_tenant_link_email_uq on platform.professional_tenant_link (tenant_id, invite_email_hmac)
  where deleted_at is null;
create index professional_tenant_link_professional_idx on platform.professional_tenant_link (professional_id);

-- ---------------------------------------------------------------------------------------------------------------
-- RLS forçada; grant por coluna (sensível fica fora e sai só por api.*)
-- ---------------------------------------------------------------------------------------------------------------
alter table platform.professional enable row level security;
alter table platform.professional force row level security;
alter table platform.professional_tenant_link enable row level security;
alter table platform.professional_tenant_link force row level security;

revoke all on platform.professional from public, anon, authenticated;
grant select (id, display_name, council, council_uf, council_number, created_at, updated_at)
  on platform.professional to authenticated;
revoke all on platform.professional_tenant_link from public, anon, authenticated;
grant select (id, tenant_id, professional_id, invited_at, propass_completed_at, updated_at, deleted_at)
  on platform.professional_tenant_link to authenticated;   -- e-mail e envelope só por api.*; escrita só por api.*

-- a clínica vê os profissionais ligados a ela (vínculo vivo), e só quem pode ver a agenda ou a equipe
create policy professional_select on platform.professional for select to authenticated
  using (exists (select 1 from platform.professional_tenant_link l
                 where l.professional_id = professional.id and l.tenant_id = (select private.current_tenant_id())
                   and l.deleted_at is null)
         and ((select private.has_permission('appointments', 'view')) or (select private.has_permission('team', 'view'))));
create policy professional_tenant_link_select on platform.professional_tenant_link for select to authenticated
  using (tenant_id = (select private.current_tenant_id()) and deleted_at is null
         and ((select private.has_permission('appointments', 'view')) or (select private.has_permission('team', 'view'))));

-- ---------------------------------------------------------------------------------------------------------------
-- api: convite, leitura, lista, reenvio (troca do e-mail antes do PROpass) e exclusão
-- ---------------------------------------------------------------------------------------------------------------
insert into audit.action (action, kind) values
  ('professional.invite', 'change'),
  ('professional.resend_invite', 'change'),
  ('professional.delete', 'change'),
  ('professional.read', 'access'),
  ('professional.list', 'access')
on conflict (action) do nothing;

create function api.professional_invite(
  p_id uuid,                          -- id do vínculo, gerado no servidor
  p_invite_email_hmac bytea,
  p_invite_email_enc bytea,
  p_envelope_id uuid,
  p_dek_wrapped bytea,
  p_kek_version smallint
) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
begin
  if v_tenant is null or not coalesce((select private.has_permission('team', 'edit')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  -- o e-mail é obrigatório: é para ele que vai o link do PROpass (PDD §10.4.3)
  if num_nulls(p_id, p_invite_email_hmac, p_invite_email_enc, p_envelope_id, p_dek_wrapped, p_kek_version) > 0 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'invite_email';
  end if;
  if exists (select 1 from platform.professional_tenant_link l
             where l.tenant_id = v_tenant and l.invite_email_hmac = p_invite_email_hmac and l.deleted_at is null) then
    raise exception using errcode = '23505', message = 'ATTA-IN-0002', detail = 'invite_email';
  end if;
  insert into platform.professional_tenant_link (id, tenant_id, invite_email_hmac, invite_email_enc, envelope_id,
                                                 dek_wrapped, kek_version)
  values (p_id, v_tenant, p_invite_email_hmac, p_invite_email_enc, p_envelope_id, p_dek_wrapped, p_kek_version);
  perform audit.record_event('professional.invite', 'platform.professional_tenant_link', p_id, '{}');
  return p_id;
end;
$$;

-- Reenviar Link / Editar: enquanto o PROpass não foi feito, a clínica pode trocar o e-mail (mesmo envelope). O envio em
-- si é da fila de mensagens (Integrações); aqui fica o registro.
create function api.professional_resend_invite(
  p_link_id uuid,
  p_invite_email_hmac bytea default null,
  p_invite_email_enc bytea default null
) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_link platform.professional_tenant_link;
  v_changed boolean;
begin
  if v_tenant is null or not coalesce((select private.has_permission('team', 'edit')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  select * into v_link from platform.professional_tenant_link l
  where l.tenant_id = v_tenant and l.id = p_link_id and l.deleted_at is null;
  if not found then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'professional_link_id';
  end if;
  if num_nonnulls(p_invite_email_hmac, p_invite_email_enc) = 1 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'invite_email';
  end if;
  v_changed := p_invite_email_enc is not null and p_invite_email_enc is distinct from v_link.invite_email_enc;
  if v_changed then
    -- depois do PROpass o e-mail é o do profissional, travado
    if v_link.professional_id is not null then
      raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'propass';
    end if;
    if exists (select 1 from platform.professional_tenant_link l
               where l.tenant_id = v_tenant and l.invite_email_hmac = p_invite_email_hmac and l.deleted_at is null
                 and l.id <> p_link_id) then
      raise exception using errcode = '23505', message = 'ATTA-IN-0002', detail = 'invite_email';
    end if;
    update platform.professional_tenant_link l
    set invite_email_hmac = p_invite_email_hmac, invite_email_enc = p_invite_email_enc, updated_at = now()
    where l.id = p_link_id;
  end if;
  perform audit.record_event('professional.resend_invite', 'platform.professional_tenant_link', p_link_id,
    jsonb_build_object('email_changed', v_changed),
    case when v_changed then jsonb_build_object('invite_email_enc', encode(v_link.invite_email_enc, 'base64')) end,
    case when v_changed then jsonb_build_object('invite_email_enc', encode(p_invite_email_enc, 'base64')) end);
end;
$$;

create function api.professional_delete(p_link_id uuid) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
begin
  if v_tenant is null or not coalesce((select private.has_permission('team', 'edit')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  update platform.professional_tenant_link l set deleted_at = now(), updated_at = now()
  where l.tenant_id = v_tenant and l.id = p_link_id and l.deleted_at is null;
  if not found then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'professional_link_id';
  end if;
  perform audit.record_event('professional.delete', 'platform.professional_tenant_link', p_link_id, '{}');
end;
$$;

-- Leitura e lista: antes do PROpass, só o e-mail do convite (envelope do vínculo); depois, o que a lista da §10.4.3
-- mostra (nome, conselho e registro, WhatsApp e e-mail com o envelope do profissional, para o "clicar copia") e o CPF
-- só mascarado, só no get.
create function api.professional_get(p_link_id uuid)
returns table (link_id uuid, status text, invite_email_enc bytea, invite_envelope_id uuid, invite_dek_wrapped bytea,
               invite_kek_version smallint, professional_id uuid, display_name text, council text, council_uf text,
               council_number text, cpf_masked text, phone_enc bytea, email_enc bytea, dek_wrapped bytea,
               kek_version smallint, invited_at timestamptz, propass_completed_at timestamptz)
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
  select l.id, case when l.professional_id is null then 'convite_enviado' else 'cadastro_concluido' end,
         case when l.professional_id is null then l.invite_email_enc end,
         case when l.professional_id is null then l.envelope_id end,
         case when l.professional_id is null then l.dek_wrapped end,
         case when l.professional_id is null then l.kek_version end,
         p.id, p.display_name, p.council, p.council_uf, p.council_number, p.cpf_masked, p.phone_enc, p.email_enc,
         p.dek_wrapped, p.kek_version, l.invited_at, l.propass_completed_at
  from platform.professional_tenant_link l
  left join platform.professional p on p.id = l.professional_id and p.deleted_at is null
  where l.tenant_id = v_tenant and l.id = p_link_id and l.deleted_at is null;
  if not found then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'professional_link_id';
  end if;
  perform audit.record_event('professional.read', 'platform.professional_tenant_link', p_link_id, '{}');
end;
$$;

create function api.professional_list()
returns table (link_id uuid, status text, invite_email_enc bytea, invite_envelope_id uuid, invite_dek_wrapped bytea,
               invite_kek_version smallint, professional_id uuid, display_name text, council text, council_uf text,
               council_number text, phone_enc bytea, email_enc bytea, dek_wrapped bytea, kek_version smallint,
               invited_at timestamptz)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_count int;
begin
  if v_tenant is null or not coalesce((select private.has_permission('team', 'view')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  return query
  select l.id, case when l.professional_id is null then 'convite_enviado' else 'cadastro_concluido' end,
         case when l.professional_id is null then l.invite_email_enc end,
         case when l.professional_id is null then l.envelope_id end,
         case when l.professional_id is null then l.dek_wrapped end,
         case when l.professional_id is null then l.kek_version end,
         p.id, p.display_name, p.council, p.council_uf, p.council_number, p.phone_enc, p.email_enc, p.dek_wrapped,
         p.kek_version, l.invited_at
  from platform.professional_tenant_link l
  left join platform.professional p on p.id = l.professional_id and p.deleted_at is null
  where l.tenant_id = v_tenant and l.deleted_at is null
  order by lower(p.display_name) nulls last, l.invited_at, l.id
  limit 500;
  get diagnostics v_count = row_count;
  perform audit.record_event('professional.list', 'platform.professional_tenant_link', null,
    jsonb_build_object('results', v_count));
end;
$$;

revoke all on function api.professional_invite(uuid, bytea, bytea, uuid, bytea, smallint) from public, anon;
revoke all on function api.professional_resend_invite(uuid, bytea, bytea) from public, anon;
revoke all on function api.professional_delete(uuid) from public, anon;
revoke all on function api.professional_get(uuid) from public, anon;
revoke all on function api.professional_list() from public, anon;
grant execute on function api.professional_invite(uuid, bytea, bytea, uuid, bytea, smallint) to authenticated;
grant execute on function api.professional_resend_invite(uuid, bytea, bytea) to authenticated;
grant execute on function api.professional_delete(uuid) to authenticated;
grant execute on function api.professional_get(uuid) to authenticated;
grant execute on function api.professional_list() to authenticated;
