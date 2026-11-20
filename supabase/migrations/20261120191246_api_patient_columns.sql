-- MIG-12 (colunas da tela de Pacientes, MIG-43 do Frontend 3): a lista e a busca devolvem as mesmas colunas, que a tela
-- precisa para a linha de Pacientes (PDD v206 §10.1: Paciente, Identificação, Contato, Último atendimento, Documentos).
-- As duas leem de private.patient_rows, o único lugar que decide o que a clínica vê de cada paciente:
--   - nome de exibição (o social quando houver) e se ele é o social; nascimento; is_incomplete (calculado no banco);
--   - documento mascarado, selo, contato cifrado com o envelope e o envelope_id para o AAD (ADR 0002 §6);
--   - em network_access = 'pending', só o que a clínica digitou (local_*), como antes, e o selo de verificação da rede
--     não aparece (is_verified = false, verified_until nulo);
--   - last_appointment vem nulo até a agenda (MIG-11) e documents vem [] até o schema documents: os campos já estão no
--     contrato, para a tela não mudar quando eles chegarem;
--   - total_active: total de pacientes da clínica, para o rodapé "n de n ativo(s)".
-- A regra do CPF já na rede (PDD §10.1, decisão do dono) e o endurecimento da Segurança entram no MIG-12d.

create function private.patient_rows(p_tenant uuid)
returns table (person_id uuid, display_name text, display_is_social boolean, cpf_masked text, foreign_doc_masked text,
               birth_date date, is_incomplete boolean, is_verified boolean, verified_until timestamptz,
               phone_enc bytea, email_enc bytea, envelope_id uuid, dek_wrapped bytea, kek_version smallint,
               network_access text, linked_at timestamptz, last_appointment jsonb, documents jsonb,
               full_name_for_search text, social_name_for_search text, cpf_hmac bytea, foreign_doc_hmac bytea)
language sql stable set search_path = ''
as $$
  select p.id,
         coalesce(n.social_name, n.full_name),
         n.social_name is not null,
         p.cpf_masked, p.foreign_doc_masked,
         n.birth_date,
         p.is_incomplete,
         v.expires_at is not null, v.expires_at,
         n.phone_enc, n.email_enc, n.envelope_id, n.dek_wrapped, n.kek_version,
         l.network_access, l.linked_at,
         null::jsonb,
         '[]'::jsonb,
         n.full_name, n.social_name, p.cpf_hmac, p.foreign_doc_hmac
  from network.person_tenant_link l
  join network.person p on p.id = l.person_id
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
  -- em pending a clínica não sabe nada da rede, nem que a pessoa foi verificada (Tech Lead, revisão do #90)
  left join lateral (select iv.expires_at from network.identity_verification iv
                     where not a.pending
                       and iv.person_id = p.id and iv.result = 'aprovada' and iv.expires_at > now()
                     order by iv.expires_at desc limit 1) v on true
  where l.tenant_id = p_tenant and p.deleted_at is null
$$;
revoke all on function private.patient_rows(uuid) from public, anon, authenticated, service_role;

drop function api.patient_list(text, uuid, int);
drop function api.patient_search(text, bytea);

create function api.patient_list(
  p_after_name text default null,
  p_after_id uuid default null,
  p_limit int default 50
) returns table (person_id uuid, display_name text, display_is_social boolean, cpf_masked text,
                 foreign_doc_masked text, birth_date date, is_incomplete boolean, is_verified boolean,
                 verified_until timestamptz, phone_enc bytea, email_enc bytea, envelope_id uuid, dek_wrapped bytea,
                 kek_version smallint, network_access text, linked_at timestamptz, last_appointment jsonb,
                 documents jsonb, total_active int)
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
  select r.person_id, r.display_name, r.display_is_social, r.cpf_masked, r.foreign_doc_masked, r.birth_date,
         r.is_incomplete, r.is_verified, r.verified_until, r.phone_enc, r.email_enc, r.envelope_id, r.dek_wrapped,
         r.kek_version, r.network_access, r.linked_at, r.last_appointment, r.documents, r.total::int
  -- uma leitura só: o total de ativos sai da mesma consulta, antes do filtro da página ou da busca
  from (select pr.*, count(*) over () as total from private.patient_rows(v_tenant) pr) r
  where p_after_name is null or (lower(r.display_name), r.person_id) > (lower(p_after_name), p_after_id)
  order by lower(r.display_name), r.person_id
  limit p_limit;
  get diagnostics v_count = row_count;
  perform audit.record_event('patient.list', 'network.person', null, jsonb_build_object('results', v_count));
end;
$$;

-- Busca por nome (só entre os pacientes da clínica; em pending, só no nome digitado) ou por CPF/documento (HMAC do
-- servidor). Mesmas colunas da lista, para a busca mostrar a mesma linha.
create function api.patient_search(p_name text default null, p_doc_hmac bytea default null)
returns table (person_id uuid, display_name text, display_is_social boolean, cpf_masked text,
               foreign_doc_masked text, birth_date date, is_incomplete boolean, is_verified boolean,
               verified_until timestamptz, phone_enc bytea, email_enc bytea, envelope_id uuid, dek_wrapped bytea,
               kek_version smallint, network_access text, linked_at timestamptz, last_appointment jsonb,
               documents jsonb, total_active int)
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
  select r.person_id, r.display_name, r.display_is_social, r.cpf_masked, r.foreign_doc_masked, r.birth_date,
         r.is_incomplete, r.is_verified, r.verified_until, r.phone_enc, r.email_enc, r.envelope_id, r.dek_wrapped,
         r.kek_version, r.network_access, r.linked_at, r.last_appointment, r.documents, r.total::int
  -- uma leitura só: o total de ativos sai da mesma consulta, antes do filtro da página ou da busca
  from (select pr.*, count(*) over () as total from private.patient_rows(v_tenant) pr) r
  where case when p_doc_hmac is not null then r.cpf_hmac = p_doc_hmac or r.foreign_doc_hmac = p_doc_hmac
             else r.full_name_for_search ilike v_pattern or r.social_name_for_search ilike v_pattern end
  order by lower(r.display_name), r.person_id
  limit 20;
  get diagnostics v_count = row_count;
  perform audit.record_event('patient.search', 'network.person', null,
    jsonb_build_object('by', case when p_doc_hmac is not null then 'documento' else 'nome' end, 'results', v_count));
end;
$$;

revoke all on function api.patient_list(text, uuid, int) from public, anon;
revoke all on function api.patient_search(text, bytea) from public, anon;
grant execute on function api.patient_list(text, uuid, int) to authenticated;
grant execute on function api.patient_search(text, bytea) to authenticated;
