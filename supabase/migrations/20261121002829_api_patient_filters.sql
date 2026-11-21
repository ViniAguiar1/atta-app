-- MIG-12 (lista de Pacientes pixel perfect, captura 11 do simulador; pedido do Frontend 3):
--   1. filtro e contadores na lista e na busca: "Cadastrados em outra clínica", "Com atendimento hoje" e "Arquivados".
--      - outra clínica = a clínica não criou a pessoa (network_access <> 'owner': granted ou pending);
--      - atendimento hoje = algum agendamento de hoje, no fuso da clínica, que não foi cancelado;
--      - arquivados: decisão do dono pelo CTO (PLANO, "Arquivar paciente"; R26): só o gestor (ADMIN) arquiva e desarquiva,
--        na Pasta; vale só para o vínculo desta clínica (rede e documentos não mudam); o arquivado some da lista e da busca
--        padrão, aparece no filtro "Arquivados" e não pode ser agendado até desarquivar (o check-in novo trava no
--        MIG-13); volta só pelo "Desarquivar". Arquivar e desarquivar vão para a trilha.
--      Os contadores contam todos os pacientes da clínica, antes do filtro e da página, como o total_active.
--   2. "Selo expirado": verified_until passa a vir também vencido (o último selo aprovado), com is_verified = false.
--      Em pending, continua sem nada da rede (Tech Lead, revisão do #90).
-- Assinaturas novas (p_filter e as colunas dos contadores): o PostgREST e os tipos gerados acompanham.

alter table network.person_tenant_link
  add column archived_at timestamptz,
  add column archived_by uuid;

insert into audit.action (action, kind) values
  ('patient.archive', 'change'),
  ('patient.unarchive', 'change')
on conflict (action) do nothing;

drop function api.patient_list(text, uuid, int);
drop function api.patient_search(text, bytea);
drop function private.patient_rows(uuid);

create function private.patient_rows(p_tenant uuid)
returns table (person_id uuid, display_name text, display_is_social boolean, cpf_masked text, foreign_doc_masked text,
               birth_date date, is_incomplete boolean, is_verified boolean, verified_until timestamptz,
               phone_enc bytea, email_enc bytea, envelope_id uuid, dek_wrapped bytea, kek_version smallint,
               network_access text, linked_at timestamptz, last_appointment jsonb, documents jsonb,
               from_other_clinic boolean, has_appointment_today boolean, is_archived boolean,
               full_name_for_search text, social_name_for_search text, cpf_hmac bytea, foreign_doc_hmac bytea)
language sql stable set search_path = ''
as $$
  select p.id,
         coalesce(n.social_name, n.full_name),
         n.social_name is not null,
         p.cpf_masked, p.foreign_doc_masked,
         n.birth_date,
         p.is_incomplete,
         coalesce(v.expires_at > now(), false), v.expires_at,
         n.phone_enc, n.email_enc, n.envelope_id, n.dek_wrapped, n.kek_version,
         l.network_access, l.linked_at,
         null::jsonb,
         '[]'::jsonb,
         l.network_access <> 'owner',
         exists (select 1 from atta_in.appointment ap
                 where ap.tenant_id = l.tenant_id and ap.person_id = p.id and ap.status <> 'cancelado'
                   and (ap.starts_at at time zone t.timezone)::date = (now() at time zone t.timezone)::date),
         l.archived_at is not null,
         n.full_name, n.social_name, p.cpf_hmac, p.foreign_doc_hmac
  from network.person_tenant_link l
  join network.person p on p.id = l.person_id
  join platform.tenant t on t.id = l.tenant_id
  cross join lateral (select l.network_access = 'pending') a (pending)
  cross join lateral (select case when a.pending then l.local_full_name else p.full_name end,
                             case when a.pending then l.local_social_name else p.social_name end,
                             case when a.pending then l.local_birth_date else p.birth_date end,
                             case when a.pending then l.local_phone_enc else p.phone_enc end,
                             case when a.pending then l.local_email_enc else p.email_enc end,
                             case when a.pending then l.local_envelope_id else p.id end,
                             case when a.pending then l.local_dek_wrapped else p.dek_wrapped end,
                             case when a.pending then l.local_kek_version else p.kek_version end
                     ) n (full_name, social_name, birth_date, phone_enc, email_enc, envelope_id, dek_wrapped,
                          kek_version)
  -- o último selo aprovado, válido ou vencido ("Com selo" / "Selo expirado"); em pending, nada da rede
  left join lateral (select iv.expires_at from network.identity_verification iv
                     where not a.pending and iv.person_id = p.id and iv.result = 'aprovada'
                     order by iv.expires_at desc limit 1) v on true
  where l.tenant_id = p_tenant and p.deleted_at is null
$$;
revoke all on function private.patient_rows(uuid) from public, anon, authenticated, service_role;

create function api.patient_list(
  p_after_name text default null,
  p_after_id uuid default null,
  p_limit int default 50,
  p_filter text default null          -- null | outra_clinica | atendimento_hoje | arquivados
) returns table (person_id uuid, display_name text, display_is_social boolean, cpf_masked text,
                 foreign_doc_masked text, birth_date date, is_incomplete boolean, is_verified boolean,
                 verified_until timestamptz, phone_enc bytea, email_enc bytea, envelope_id uuid, dek_wrapped bytea,
                 kek_version smallint, network_access text, linked_at timestamptz, last_appointment jsonb,
                 documents jsonb, total_active int, count_other_clinic int, count_today int, count_archived int)
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
  if p_filter is not null and p_filter not in ('outra_clinica', 'atendimento_hoje', 'arquivados') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'filter';
  end if;
  return query
  select r.person_id, r.display_name, r.display_is_social, r.cpf_masked, r.foreign_doc_masked, r.birth_date,
         r.is_incomplete, r.is_verified, r.verified_until, r.phone_enc, r.email_enc, r.envelope_id, r.dek_wrapped,
         r.kek_version, r.network_access, r.linked_at, r.last_appointment, r.documents, r.total::int,
         r.other::int, r.today::int, r.archived::int
  -- uma leitura só: o total e os contadores saem da mesma consulta, antes do filtro e da página
  from (select pr.*, count(*) filter (where not pr.is_archived) over () as total,
               count(*) filter (where pr.from_other_clinic and not pr.is_archived) over () as other,
               count(*) filter (where pr.has_appointment_today and not pr.is_archived) over () as today,
               count(*) filter (where pr.is_archived) over () as archived
        from private.patient_rows(v_tenant) pr) r
  where (p_after_name is null or (lower(r.display_name), r.person_id) > (lower(p_after_name), p_after_id))
    and case p_filter when 'outra_clinica' then r.from_other_clinic and not r.is_archived
                      when 'atendimento_hoje' then r.has_appointment_today and not r.is_archived
                      when 'arquivados' then r.is_archived
                      else not r.is_archived end
  order by lower(r.display_name), r.person_id
  limit p_limit;
  get diagnostics v_count = row_count;
  perform audit.record_event('patient.list', 'network.person', null,
    jsonb_build_object('results', v_count, 'filter', p_filter));
end;
$$;

-- Busca por nome (só entre os pacientes da clínica; em pending, só no nome digitado) ou por CPF/documento (HMAC do
-- servidor), com o mesmo filtro. Mesmas colunas da lista.
create function api.patient_search(p_name text default null, p_doc_hmac bytea default null, p_filter text default null)
returns table (person_id uuid, display_name text, display_is_social boolean, cpf_masked text,
               foreign_doc_masked text, birth_date date, is_incomplete boolean, is_verified boolean,
               verified_until timestamptz, phone_enc bytea, email_enc bytea, envelope_id uuid, dek_wrapped bytea,
               kek_version smallint, network_access text, linked_at timestamptz, last_appointment jsonb,
               documents jsonb, total_active int, count_other_clinic int, count_today int, count_archived int)
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
  if p_filter is not null and p_filter not in ('outra_clinica', 'atendimento_hoje', 'arquivados') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'filter';
  end if;
  v_pattern := '%' || replace(replace(replace(btrim(coalesce(p_name, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
  select r.person_id, r.display_name, r.display_is_social, r.cpf_masked, r.foreign_doc_masked, r.birth_date,
         r.is_incomplete, r.is_verified, r.verified_until, r.phone_enc, r.email_enc, r.envelope_id, r.dek_wrapped,
         r.kek_version, r.network_access, r.linked_at, r.last_appointment, r.documents, r.total::int,
         r.other::int, r.today::int, r.archived::int
  from (select pr.*, count(*) filter (where not pr.is_archived) over () as total,
               count(*) filter (where pr.from_other_clinic and not pr.is_archived) over () as other,
               count(*) filter (where pr.has_appointment_today and not pr.is_archived) over () as today,
               count(*) filter (where pr.is_archived) over () as archived
        from private.patient_rows(v_tenant) pr) r
  where case when p_doc_hmac is not null then r.cpf_hmac = p_doc_hmac or r.foreign_doc_hmac = p_doc_hmac
             else r.full_name_for_search ilike v_pattern or r.social_name_for_search ilike v_pattern end
    and case p_filter when 'outra_clinica' then r.from_other_clinic and not r.is_archived
                      when 'atendimento_hoje' then r.has_appointment_today and not r.is_archived
                      when 'arquivados' then r.is_archived
                      else not r.is_archived end
  order by lower(r.display_name), r.person_id
  limit 20;
  get diagnostics v_count = row_count;
  perform audit.record_event('patient.search', 'network.person', null,
    jsonb_build_object('by', case when p_doc_hmac is not null then 'documento' else 'nome' end, 'results', v_count,
                       'filter', p_filter));
end;
$$;

revoke all on function api.patient_list(text, uuid, int, text) from public, anon;
revoke all on function api.patient_search(text, bytea, text) from public, anon;
grant execute on function api.patient_list(text, uuid, int, text) to authenticated;
grant execute on function api.patient_search(text, bytea, text) to authenticated;

-- Arquivar e desarquivar (Pasta do Paciente): só o gestor (ADMIN com o 2º fator, pela has_permission, e vínculo ADMIN
-- ativo nesta clínica). Pedir o estado em que já está é recusado (ATTA-IN-0003 archived), para a tela não mentir.
create function api.patient_set_archived(p_person_id uuid, p_archived boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_was timestamptz;
begin
  if v_tenant is null or not coalesce((select private.has_permission('patients', 'edit')), false)
     or not exists (select 1 from platform.membership m
                    where m.user_id = (select auth.uid()) and m.tenant_id = v_tenant and m.app_role = 'ADMIN'
                      and m.status = 'active' and m.deleted_at is null) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if p_archived is null then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'archived';
  end if;
  select l.archived_at into v_was from network.person_tenant_link l
  where l.tenant_id = v_tenant and l.person_id = p_person_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'person_id';
  end if;
  if (v_was is not null) = p_archived then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'archived';
  end if;
  update network.person_tenant_link l
  set archived_at = case when p_archived then now() end,
      archived_by = case when p_archived then (select auth.uid()) end
  where l.tenant_id = v_tenant and l.person_id = p_person_id;
  perform audit.record_event(case when p_archived then 'patient.archive' else 'patient.unarchive' end,
    'network.person', p_person_id, '{}', jsonb_build_object('archived', not p_archived),
    jsonb_build_object('archived', p_archived));
  return jsonb_build_object('person_id', p_person_id, 'archived', p_archived);
end;
$$;
revoke all on function api.patient_set_archived(uuid, boolean) from public, anon;
grant execute on function api.patient_set_archived(uuid, boolean) to authenticated;

-- arquivado não é agendado até desarquivar (qualquer caminho de escrita: gatilho, como as outras regras da agenda)
create function atta_in.appointment_patient_not_archived() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.person_id is not null and exists (
       select 1 from network.person_tenant_link l
       where l.tenant_id = new.tenant_id and l.person_id = new.person_id and l.archived_at is not null) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'archived';
  end if;
  return new;
end;
$$;
revoke all on function atta_in.appointment_patient_not_archived() from public, anon, authenticated;
create trigger appointment_patient_not_archived before insert on atta_in.appointment
  for each row execute function atta_in.appointment_patient_not_archived();

-- patient_get (Pasta do Paciente): devolve archived_at, para a Pasta mostrar "Arquivar" ou "Desarquivar" e o aviso de que
-- o arquivado não é agendado (Backend 4, revisão do #158); e o selo com a mesma regra da lista (vencido com is_verified
-- falso; em pending, nada da rede). Assinatura nova: drop e recreate, com os mesmos grants.
drop function api.patient_get(uuid);
create function api.patient_get(p_person_id uuid)
returns table (person_id uuid, full_name text, social_name text, birth_date date, cpf_masked text,
               foreign_doc_type text, foreign_doc_masked text, phone_enc bytea, email_enc bytea, dek_wrapped bytea,
               kek_version smallint, is_incomplete boolean, is_verified boolean, verified_until timestamptz,
               linked_at timestamptz, origin text, network_access text,
               envelope_id uuid, archived_at timestamptz)
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
         coalesce(v.expires_at > now(), false), v.expires_at, l.linked_at, l.origin, l.network_access, n.envelope_id,
         l.archived_at
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
                     where not a.pending and iv.person_id = p.id and iv.result = 'aprovada'
                     order by iv.expires_at desc limit 1) v on true
  where l.tenant_id = v_tenant and l.person_id = p_person_id and p.deleted_at is null;
  if not found then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'person_id';
  end if;
  perform audit.record_event('patient.read', 'network.person', p_person_id, '{}');
end;
$$;
revoke all on function api.patient_get(uuid) from public, anon;
grant execute on function api.patient_get(uuid) to authenticated;
