-- MIG-12 (parte c): contato local do vínculo em acesso pendente à rede (Tech Lead; ADR 0001 §1 e ADR 0005 §1).
--
-- Em pending, a clínica não vê o contato da rede, mas precisa de destino para o código e o link do check-in. O contato
-- que a recepção digitou fica no vínculo, com envelope próprio e AAD
-- tenant_id|network.person_tenant_link|<coluna>|<local_envelope_id>. O servidor gera o local_envelope_id antes do
-- register (como o p_id da pessoa) e cifra o contato local antes de saber se a pessoa já existe: o register grava tudo
-- numa chamada em pending e descarta em owner. get e list devolvem o contato e o envelope locais em pending, com o
-- envelope_id para o AAD (o da pessoa em owner e granted, o do vínculo em pending). A fila usa o mesmo critério.

alter table network.person_tenant_link
  add column local_envelope_id uuid,
  add column local_phone_enc bytea,
  add column local_email_enc bytea,
  add column local_dek_wrapped bytea,
  add column local_kek_version smallint,
  add constraint person_tenant_link_local_envelope_check check (
    num_nulls(local_envelope_id, local_dek_wrapped, local_kek_version) in (0, 3)
    and (num_nonnulls(local_phone_enc, local_email_enc) = 0) = (local_dek_wrapped is null));

drop function api.patient_register(uuid, text, text, date, bytea, text, bytea, text, bytea, text, bytea, bytea, bytea, bytea, smallint, boolean);
drop function api.patient_get(uuid);
drop function api.patient_list(text, uuid, int);
drop function api.patient_update(uuid, text, text, text, date, bytea, bytea);

create function api.patient_register(
  p_id uuid,                        -- gerado no servidor: entra na AAD do envelope (tenant|tabela|coluna|id)
  p_full_name text,
  p_social_name text default null,
  p_birth_date date default null,
  p_cpf_hmac bytea default null,
  p_cpf_masked text default null,
  p_cpf_enc bytea default null,
  p_foreign_doc_type text default null,
  p_foreign_doc_hmac bytea default null,
  p_foreign_doc_masked text default null,
  p_foreign_doc_enc bytea default null,
  p_phone_enc bytea default null,
  p_email_enc bytea default null,
  p_dek_wrapped bytea default null,
  p_kek_version smallint default null,
  p_is_incomplete boolean default false,
  -- contato local do vínculo, cifrado pelo servidor antes de saber se a pessoa já existe (AAD
  -- tenant_id|network.person_tenant_link|<coluna>|<local_envelope_id>): gravado em pending, descartado em owner
  p_local_envelope_id uuid default null,
  p_local_phone_enc bytea default null,
  p_local_email_enc bytea default null,
  p_local_dek_wrapped bytea default null,
  p_local_kek_version smallint default null
) returns table (person_id uuid, reused boolean)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_existing uuid;
begin
  if v_tenant is null or not coalesce((select private.has_permission('patients', 'create')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if p_full_name is null or length(btrim(p_full_name)) < 2 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'full_name';
  end if;
  if p_birth_date is not null and p_birth_date > current_date then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'birth_date';
  end if;
  -- contato local (vale só se a pessoa for reaproveitada): contato exige o envelope local inteiro, e vice-versa
  if (num_nonnulls(p_local_phone_enc, p_local_email_enc) = 0)
       <> (num_nonnulls(p_local_envelope_id, p_local_dek_wrapped, p_local_kek_version) = 0)
     or num_nonnulls(p_local_envelope_id, p_local_dek_wrapped, p_local_kek_version) not in (0, 3) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'local_envelope';
  end if;

  select p.id into v_existing from network.person p
  where (p_cpf_hmac is not null and p.cpf_hmac = p_cpf_hmac)
     or (p_foreign_doc_type is not null and p.foreign_doc_type = p_foreign_doc_type
         and p.foreign_doc_hmac = p_foreign_doc_hmac)
  limit 1;

  if v_existing is not null then
    if exists (select 1 from network.person_tenant_link l where l.tenant_id = v_tenant and l.person_id = v_existing) then
      raise exception using errcode = '23505', message = 'ATTA-IN-0002', detail = 'cpf';   -- já cadastrado aqui
    end if;
    -- acesso pendente: guarda só o que a recepção digitou; contato e dado de rede ficam como estão (dono, 20/11)
    insert into network.person_tenant_link (tenant_id, person_id, origin, network_access, local_full_name,
                                            local_social_name, local_birth_date, local_envelope_id, local_phone_enc,
                                            local_email_enc, local_dek_wrapped, local_kek_version)
    values (v_tenant, v_existing, 'recepcao', 'pending', btrim(p_full_name), nullif(btrim(p_social_name), ''),
            p_birth_date, p_local_envelope_id, p_local_phone_enc, p_local_email_enc, p_local_dek_wrapped,
            p_local_kek_version);
    perform audit.record_event('patient.register', 'network.person', v_existing, jsonb_build_object('reused', true));
    return query select v_existing, true;
    return;
  end if;

  insert into network.person (id, full_name, social_name, birth_date, cpf_hmac, cpf_masked, cpf_enc,
                              foreign_doc_type, foreign_doc_hmac, foreign_doc_masked, foreign_doc_enc,
                              phone_enc, email_enc, dek_wrapped, kek_version, is_incomplete)
  values (p_id, p_full_name, p_social_name, p_birth_date, p_cpf_hmac, p_cpf_masked, p_cpf_enc,
          p_foreign_doc_type, p_foreign_doc_hmac, p_foreign_doc_masked, p_foreign_doc_enc,
          p_phone_enc, p_email_enc, p_dek_wrapped, p_kek_version, coalesce(p_is_incomplete, false));
  insert into network.person_tenant_link (tenant_id, person_id, origin) values (v_tenant, p_id, 'recepcao');
  perform audit.record_event('patient.register', 'network.person', p_id, jsonb_build_object('reused', false));
  return query select p_id, false;
end;
$$;

create function api.patient_get(p_person_id uuid)
returns table (person_id uuid, full_name text, social_name text, birth_date date, cpf_masked text,
               foreign_doc_type text, foreign_doc_masked text, phone_enc bytea, email_enc bytea, dek_wrapped bytea,
               kek_version smallint, is_incomplete boolean, is_verified boolean, verified_until timestamptz,
               linked_at timestamptz, origin text, network_access text,
               envelope_id uuid)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid := (select private.current_tenant_id());
begin
  if v_tenant is null or not coalesce((select private.has_permission('patients', 'view')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  return query
  select p.id, n.full_name, n.social_name, n.birth_date, p.cpf_masked, p.foreign_doc_type, p.foreign_doc_masked,
         n.phone_enc, n.email_enc, n.dek_wrapped, n.kek_version, p.is_incomplete,
         v.expires_at is not null, v.expires_at, l.linked_at, l.origin, l.network_access, n.envelope_id
  from network.person_tenant_link l
  join network.person p on p.id = l.person_id
  cross join lateral (select l.network_access = 'pending') a (pending)
  cross join lateral (select case when a.pending then l.local_full_name else p.full_name end,
                             case when a.pending then l.local_social_name else p.social_name end,
                             case when a.pending then l.local_birth_date else p.birth_date end,
                             case when a.pending then l.local_phone_enc else p.phone_enc end,
                             case when a.pending then l.local_email_enc else p.email_enc end,
                             case when a.pending then l.local_dek_wrapped else p.dek_wrapped end,
                             case when a.pending then l.local_kek_version else p.kek_version end,
                             case when a.pending then l.local_envelope_id else p.id end
                     ) n (full_name, social_name, birth_date, phone_enc, email_enc, dek_wrapped, kek_version, envelope_id)
  left join lateral (select iv.expires_at from network.identity_verification iv
                     where iv.person_id = p.id and iv.result = 'aprovada' and iv.expires_at > now()
                     order by iv.expires_at desc limit 1) v on true
  where l.tenant_id = v_tenant and l.person_id = p_person_id and p.deleted_at is null;
  if not found then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'person_id';
  end if;
  perform audit.record_event('patient.read', 'network.person', p_person_id, '{}');
end;
$$;

create function api.patient_list(
  p_after_name text default null,
  p_after_id uuid default null,
  p_limit int default 50
) returns table (person_id uuid, display_name text, cpf_masked text, foreign_doc_masked text, phone_enc bytea,
                 email_enc bytea, dek_wrapped bytea, kek_version smallint, linked_at timestamptz,
                 network_access text, envelope_id uuid)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_count int;
begin
  if v_tenant is null or not coalesce((select private.has_permission('patients', 'view')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if p_limit is null or p_limit not between 1 and 100 or num_nonnulls(p_after_name, p_after_id) = 1 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'page';
  end if;
  return query
  select p.id, n.display_name, p.cpf_masked, p.foreign_doc_masked, n.phone_enc, n.email_enc,
         n.dek_wrapped, n.kek_version, l.linked_at, l.network_access, n.envelope_id
  from network.person_tenant_link l
  join network.person p on p.id = l.person_id
  cross join lateral (select l.network_access = 'pending') a (pending)
  cross join lateral (select case when a.pending then coalesce(l.local_social_name, l.local_full_name)
                                  else coalesce(p.social_name, p.full_name) end,
                             case when a.pending then l.local_phone_enc else p.phone_enc end,
                             case when a.pending then l.local_email_enc else p.email_enc end,
                             case when a.pending then l.local_dek_wrapped else p.dek_wrapped end,
                             case when a.pending then l.local_kek_version else p.kek_version end,
                             case when a.pending then l.local_envelope_id else p.id end
                     ) n (display_name, phone_enc, email_enc, dek_wrapped, kek_version, envelope_id)
  where l.tenant_id = v_tenant and p.deleted_at is null
    and (p_after_name is null or (lower(n.display_name), p.id) > (lower(p_after_name), p_after_id))
  order by lower(n.display_name), p.id
  limit p_limit;
  get diagnostics v_count = row_count;
  perform audit.record_event('patient.list', 'network.person', null, jsonb_build_object('results', v_count));
end;
$$;

create function api.patient_update(
  p_person_id uuid,
  p_reason text,
  p_full_name text default null,
  p_social_name text default null,
  p_birth_date date default null,
  p_phone_enc bytea default null,
  p_email_enc bytea default null,
  -- só em pending e só quando o vínculo ainda não tem envelope local: cria o envelope do contato local
  p_local_envelope_id uuid default null,
  p_local_dek_wrapped bytea default null,
  p_local_kek_version smallint default null
) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_old network.person;
  v_link network.person_tenant_link;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
begin
  if v_tenant is null or not coalesce((select private.has_permission('patients', 'edit')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  select * into v_link from network.person_tenant_link l where l.tenant_id = v_tenant and l.person_id = p_person_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'person_id';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'reason';
  end if;
  if p_birth_date is not null and p_birth_date > current_date then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'birth_date';
  end if;

  -- acesso pendente: edita só os campos locais do vínculo; contato e dado de rede não se tocam (ADR 0001 §1)
  if v_link.network_access = 'pending' then
    -- contato local com o envelope do vínculo; o envelope nasce uma vez (aqui ou no register) e depois não muda
    if num_nonnulls(p_local_envelope_id, p_local_dek_wrapped, p_local_kek_version) not in (0, 3)
       or (num_nonnulls(p_local_envelope_id, p_local_dek_wrapped, p_local_kek_version) = 3
           and (v_link.local_dek_wrapped is not null or num_nonnulls(p_phone_enc, p_email_enc) = 0))
       or (num_nonnulls(p_phone_enc, p_email_enc) > 0 and v_link.local_dek_wrapped is null
           and p_local_dek_wrapped is null) then
      raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'local_envelope';
    end if;
    update network.person_tenant_link l set
      local_full_name = coalesce(nullif(btrim(p_full_name), ''), l.local_full_name),
      local_social_name = coalesce(nullif(btrim(p_social_name), ''), l.local_social_name),
      local_birth_date = coalesce(p_birth_date, l.local_birth_date),
      local_phone_enc = coalesce(p_phone_enc, l.local_phone_enc),
      local_email_enc = coalesce(p_email_enc, l.local_email_enc),
      local_envelope_id = coalesce(l.local_envelope_id, p_local_envelope_id),
      local_dek_wrapped = coalesce(l.local_dek_wrapped, p_local_dek_wrapped),
      local_kek_version = coalesce(l.local_kek_version, p_local_kek_version)
    where l.tenant_id = v_tenant and l.person_id = p_person_id;
    if p_full_name is not null and btrim(p_full_name) is distinct from v_link.local_full_name then
      v_before := v_before || jsonb_build_object('local_full_name', v_link.local_full_name);
      v_after := v_after || jsonb_build_object('local_full_name', btrim(p_full_name));
    end if;
    if p_social_name is not null and btrim(p_social_name) is distinct from v_link.local_social_name then
      v_before := v_before || jsonb_build_object('local_social_name', v_link.local_social_name);
      v_after := v_after || jsonb_build_object('local_social_name', btrim(p_social_name));
    end if;
    if p_birth_date is not null and p_birth_date is distinct from v_link.local_birth_date then
      v_before := v_before || jsonb_build_object('local_birth_date', v_link.local_birth_date);
      v_after := v_after || jsonb_build_object('local_birth_date', p_birth_date);
    end if;
    if p_phone_enc is not null and p_phone_enc is distinct from v_link.local_phone_enc then
      v_before := v_before || jsonb_build_object('local_phone_enc', encode(v_link.local_phone_enc, 'base64'));
      v_after := v_after || jsonb_build_object('local_phone_enc', encode(p_phone_enc, 'base64'));
    end if;
    if p_email_enc is not null and p_email_enc is distinct from v_link.local_email_enc then
      v_before := v_before || jsonb_build_object('local_email_enc', encode(v_link.local_email_enc, 'base64'));
      v_after := v_after || jsonb_build_object('local_email_enc', encode(p_email_enc, 'base64'));
    end if;
    perform audit.record_event('patient.update', 'network.person', p_person_id,
      jsonb_build_object('reason', btrim(p_reason), 'scope', 'local'), v_before, v_after);
    return;
  end if;

  -- owner e granted: nada de envelope local, e o envelope da pessoa na rede não muda aqui
  if num_nonnulls(p_local_envelope_id, p_local_dek_wrapped, p_local_kek_version) > 0 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'local_envelope';
  end if;
  if (p_phone_enc is not null or p_email_enc is not null)
     and (select p.dek_wrapped is null from network.person p where p.id = p_person_id) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'dek_wrapped';
  end if;

  select * into v_old from network.person p where p.id = p_person_id;

  update network.person p set
    full_name = coalesce(p_full_name, p.full_name),
    social_name = coalesce(p_social_name, p.social_name),
    birth_date = coalesce(p_birth_date, p.birth_date),
    phone_enc = coalesce(p_phone_enc, p.phone_enc),
    email_enc = coalesce(p_email_enc, p.email_enc),
    updated_at = now()
  where p.id = p_person_id;

  -- trilha (ADR 0003 §2): só os campos que mudaram; claro com o valor, *_enc em base64, nunca decifrado
  if p_full_name is not null and p_full_name is distinct from v_old.full_name then
    v_before := v_before || jsonb_build_object('full_name', v_old.full_name);
    v_after := v_after || jsonb_build_object('full_name', p_full_name);
  end if;
  if p_social_name is not null and p_social_name is distinct from v_old.social_name then
    v_before := v_before || jsonb_build_object('social_name', v_old.social_name);
    v_after := v_after || jsonb_build_object('social_name', p_social_name);
  end if;
  if p_birth_date is not null and p_birth_date is distinct from v_old.birth_date then
    v_before := v_before || jsonb_build_object('birth_date', v_old.birth_date);
    v_after := v_after || jsonb_build_object('birth_date', p_birth_date);
  end if;
  if p_phone_enc is not null and p_phone_enc is distinct from v_old.phone_enc then
    v_before := v_before || jsonb_build_object('phone_enc', encode(v_old.phone_enc, 'base64'));
    v_after := v_after || jsonb_build_object('phone_enc', encode(p_phone_enc, 'base64'));
  end if;
  if p_email_enc is not null and p_email_enc is distinct from v_old.email_enc then
    v_before := v_before || jsonb_build_object('email_enc', encode(v_old.email_enc, 'base64'));
    v_after := v_after || jsonb_build_object('email_enc', encode(p_email_enc, 'base64'));
  end if;

  perform audit.record_event('patient.update', 'network.person', p_person_id,
    jsonb_build_object('reason', btrim(p_reason)), v_before, v_after);
end;
$$;

revoke all on function api.patient_register(uuid, text, text, date, bytea, text, bytea, text, bytea, text, bytea, bytea, bytea, bytea, smallint, boolean, uuid, bytea, bytea, bytea, smallint) from public, anon;
revoke all on function api.patient_get(uuid) from public, anon;
revoke all on function api.patient_list(text, uuid, int) from public, anon;
revoke all on function api.patient_update(uuid, text, text, text, date, bytea, bytea, uuid, bytea, smallint) from public, anon;
grant execute on function api.patient_register(uuid, text, text, date, bytea, text, bytea, text, bytea, text, bytea, bytea, bytea, bytea, smallint, boolean, uuid, bytea, bytea, bytea, smallint) to authenticated;
grant execute on function api.patient_get(uuid) to authenticated;
grant execute on function api.patient_list(text, uuid, int) to authenticated;
grant execute on function api.patient_update(uuid, text, text, text, date, bytea, bytea, uuid, bytea, smallint) to authenticated;
