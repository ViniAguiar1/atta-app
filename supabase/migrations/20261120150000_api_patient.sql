-- MIG-12 (parte b): o painel chega ao paciente só por estas funções (decisão 0001 §1; ADR 0005 §5).
--
-- Todas SECURITY DEFINER com search_path vazio: o dono (postgres) tem BYPASSRLS, então cada função confere tenant e
-- permissão por dentro (private.current_tenant_id(), private.has_permission('patients', ...)) e devolve campos fixos.
-- O banco não decifra (ADR 0002 §6): devolve CPF mascarado e contatos cifrados com o envelope, que o servidor abre.
-- Toda leitura e mudança deixa um evento em audit, sem CPF, nome nem contato no detalhe (RN-FIC-03, RN-PAC-03).
--
-- Regras do dono (20/11): CPF já na rede sem vínculo com a clínica não é revelado. A busca não o devolve (nada de
-- oráculo de quem está na rede, ADR 0021 A-24), e o cadastro reaproveita a pessoa sem mostrar nem sobrescrever o dado
-- de rede. Os dados de rede só aparecem depois da portabilidade autorizada pelo titular (ADR 0001 §1): com o vínculo
-- em network_access = 'pending', toda função devolve só o que a própria clínica digitou (local_*), o documento
-- mascarado e o selo, sem contato nem envelope, e a edição mexe só nesses campos locais. O 'granted' vem do check-in
-- (MIG-13), com o consentimento de portabilidade do Backend 3.

-- ações deste item no catálogo fechado da auditoria (ADR 0003): leitura é access; mudança é change
insert into audit.action (action, kind) values
  ('patient.search', 'access'),
  ('patient.read', 'access'),
  ('patient.list', 'access'),
  ('patient.register', 'change'),
  ('patient.update', 'change'),
  ('patient.divergence', 'change')
on conflict (action) do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- Busca por nome (só entre os pacientes da clínica) ou por CPF/documento (HMAC calculado no servidor)
-- ---------------------------------------------------------------------------------------------------------------
create function api.patient_search(p_name text default null, p_doc_hmac bytea default null)
returns table (person_id uuid, display_name text, cpf_masked text, foreign_doc_masked text, is_verified boolean,
               linked_at timestamptz)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_pattern text;
  v_count int;
begin
  if v_tenant is null or not coalesce((select private.has_permission('patients', 'view')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if num_nonnulls(p_name, p_doc_hmac) <> 1
     or (p_name is not null and length(btrim(p_name)) < 2)
     or (p_doc_hmac is not null and octet_length(p_doc_hmac) <> 32) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'query';
  end if;
  v_pattern := '%' || replace(replace(replace(btrim(coalesce(p_name, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select p.id, coalesce(n.social_name, n.full_name), p.cpf_masked, p.foreign_doc_masked,
         exists (select 1 from network.identity_verification v
                 where v.person_id = p.id and v.result = 'aprovada' and v.expires_at > now()),
         l.linked_at
  from network.person_tenant_link l
  join network.person p on p.id = l.person_id
  -- em pending, o nome é o que a clínica digitou; o de rede nem entra na busca
  cross join lateral (select case when l.network_access = 'pending' then l.local_full_name else p.full_name end,
                             case when l.network_access = 'pending' then l.local_social_name else p.social_name end
                     ) n (full_name, social_name)
  where l.tenant_id = v_tenant
    and p.deleted_at is null
    and (case when p_doc_hmac is not null then p.cpf_hmac = p_doc_hmac or p.foreign_doc_hmac = p_doc_hmac
              else n.full_name ilike v_pattern or n.social_name ilike v_pattern end)
  order by lower(coalesce(n.social_name, n.full_name)), p.id
  limit 20;

  get diagnostics v_count = row_count;
  perform audit.record_event('patient.search', 'network.person', null,
    jsonb_build_object('by', case when p_doc_hmac is not null then 'documento' else 'nome' end, 'results', v_count));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Cadastro: CPF novo cria a pessoa; CPF já na rede reaproveita a pessoa (RN-PAC-09) e só cria o vínculo
-- ---------------------------------------------------------------------------------------------------------------
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
  p_is_incomplete boolean default false
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
                                            local_social_name, local_birth_date)
    values (v_tenant, v_existing, 'recepcao', 'pending', btrim(p_full_name), nullif(btrim(p_social_name), ''),
            p_birth_date);
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

-- ---------------------------------------------------------------------------------------------------------------
-- Leitura do cabeçalho da Pasta: só paciente com vínculo na clínica do token; fora disso, "não encontrado"
-- ---------------------------------------------------------------------------------------------------------------
create function api.patient_get(p_person_id uuid)
returns table (person_id uuid, full_name text, social_name text, birth_date date, cpf_masked text,
               foreign_doc_type text, foreign_doc_masked text, phone_enc bytea, email_enc bytea, dek_wrapped bytea,
               kek_version smallint, is_incomplete boolean, is_verified boolean, verified_until timestamptz,
               linked_at timestamptz, origin text, network_access text)
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
         v.expires_at is not null, v.expires_at, l.linked_at, l.origin, l.network_access
  from network.person_tenant_link l
  join network.person p on p.id = l.person_id
  cross join lateral (select l.network_access = 'pending') a (pending)
  cross join lateral (select case when a.pending then l.local_full_name else p.full_name end,
                             case when a.pending then l.local_social_name else p.social_name end,
                             case when a.pending then l.local_birth_date else p.birth_date end,
                             case when a.pending then null else p.phone_enc end,
                             case when a.pending then null else p.email_enc end,
                             case when a.pending then null else p.dek_wrapped end,
                             case when a.pending then null else p.kek_version end
                     ) n (full_name, social_name, birth_date, phone_enc, email_enc, dek_wrapped, kek_version)
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

-- ---------------------------------------------------------------------------------------------------------------
-- Atualização de dado cadastral, sempre com motivo (RN-PAC-03). CPF e documento não mudam aqui. Os campos cifrados
-- novos vêm com a mesma DEK da linha (o servidor abre o dek_wrapped e cifra de novo), por isso o envelope não muda.
-- ---------------------------------------------------------------------------------------------------------------
create function api.patient_update(
  p_person_id uuid,
  p_reason text,
  p_full_name text default null,
  p_social_name text default null,
  p_birth_date date default null,
  p_phone_enc bytea default null,
  p_email_enc bytea default null
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
    if p_phone_enc is not null or p_email_enc is not null then
      raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'network_access';
    end if;
    update network.person_tenant_link l set
      local_full_name = coalesce(nullif(btrim(p_full_name), ''), l.local_full_name),
      local_social_name = coalesce(nullif(btrim(p_social_name), ''), l.local_social_name),
      local_birth_date = coalesce(p_birth_date, l.local_birth_date)
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
    perform audit.record_event('patient.update', 'network.person', p_person_id,
      jsonb_build_object('reason', btrim(p_reason), 'scope', 'local'), v_before, v_after);
    return;
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

-- ---------------------------------------------------------------------------------------------------------------
-- Lista de Pacientes da clínica, paginada por (nome de exibição, id). Último atendimento e Documentos entram
-- quando a agenda (MIG-11) e os documentos (Backend 3) existirem.
-- ---------------------------------------------------------------------------------------------------------------
create function api.patient_list(
  p_after_name text default null,
  p_after_id uuid default null,
  p_limit int default 50
) returns table (person_id uuid, display_name text, cpf_masked text, foreign_doc_masked text, phone_enc bytea,
                 email_enc bytea, dek_wrapped bytea, kek_version smallint, linked_at timestamptz,
                 network_access text)
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
         n.dek_wrapped, n.kek_version, l.linked_at, l.network_access
  from network.person_tenant_link l
  join network.person p on p.id = l.person_id
  cross join lateral (select l.network_access = 'pending') a (pending)
  cross join lateral (select case when a.pending then coalesce(l.local_social_name, l.local_full_name)
                                  else coalesce(p.social_name, p.full_name) end,
                             case when a.pending then null else p.phone_enc end,
                             case when a.pending then null else p.email_enc end,
                             case when a.pending then null else p.dek_wrapped end,
                             case when a.pending then null else p.kek_version end
                     ) n (display_name, phone_enc, email_enc, dek_wrapped, kek_version)
  where l.tenant_id = v_tenant and p.deleted_at is null
    and (p_after_name is null or (lower(n.display_name), p.id) > (lower(p_after_name), p_after_id))
  order by lower(n.display_name), p.id
  limit p_limit;
  get diagnostics v_count = row_count;
  perform audit.record_event('patient.list', 'network.person', null, jsonb_build_object('results', v_count));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Divergência de nome reportada pela recepção ao time da ATTA (RN-PAC-08)
-- ---------------------------------------------------------------------------------------------------------------
create function api.report_divergence(p_person_id uuid, p_reason text) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_id uuid;
begin
  if v_tenant is null or not coalesce((select private.has_permission('patients', 'view')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if not exists (select 1 from network.person_tenant_link l where l.tenant_id = v_tenant and l.person_id = p_person_id) then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'person_id';
  end if;
  -- motivo só da lista fechada, sem texto livre (dono, 20/11)
  if p_reason is null or p_reason not in ('nome_nao_confere', 'data_nascimento_nao_confere', 'cpf_nao_e_do_paciente',
                                          'outro') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'reason';
  end if;
  insert into network.divergence_report (tenant_id, person_id, reason)
  values (v_tenant, p_person_id, p_reason) returning id into v_id;
  perform audit.record_event('patient.divergence', 'network.person', p_person_id, jsonb_build_object('report_id', v_id));
  return v_id;
end;
$$;

revoke all on function api.patient_search(text, bytea) from public, anon;
revoke all on function api.patient_register(uuid, text, text, date, bytea, text, bytea, text, bytea, text, bytea, bytea,
                                            bytea, bytea, smallint, boolean) from public, anon;
revoke all on function api.patient_get(uuid) from public, anon;
revoke all on function api.patient_update(uuid, text, text, text, date, bytea, bytea) from public, anon;
revoke all on function api.patient_list(text, uuid, int) from public, anon;
revoke all on function api.report_divergence(uuid, text) from public, anon;
grant execute on function api.patient_search(text, bytea) to authenticated;
grant execute on function api.patient_register(uuid, text, text, date, bytea, text, bytea, text, bytea, text, bytea, bytea,
                                               bytea, bytea, smallint, boolean) to authenticated;
grant execute on function api.patient_get(uuid) to authenticated;
grant execute on function api.patient_update(uuid, text, text, text, date, bytea, bytea) to authenticated;
grant execute on function api.patient_list(text, uuid, int) to authenticated;
grant execute on function api.report_divergence(uuid, text) to authenticated;
