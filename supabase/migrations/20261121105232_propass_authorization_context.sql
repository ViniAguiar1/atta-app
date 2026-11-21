-- PROpass real (Tech Lead, 21/11; ADR 0001, "Dados da clínica e texto do Termo"): o servidor pede, pelo link, os dados
-- da clínica e o texto vigente do Termo de Autorização, e a gravação confere a clínica do payload contra o cadastro.
--   - api.propass_authorization_context(p_secret_hash), só service_role, resolvida pelo link professional_propass com
--     o mesmo grant_is_valid do api.propass_resolve (nunca por id vindo do navegador). Devolve a razão social
--     (platform.tenant.legal_name, #235), o nome (trade_name = tenant.name), o CNPJ (14 dígitos) e a versão vigente do
--     modelo de sistema, com o body. Sem razão social, sem CNPJ ou sem modelo: P0001 ATTA-IN-0003, detail 'legal_name',
--     'cnpj' ou 'authorization_template' (não devolve nulo). Quem preenche os {{campos}} é o servidor (preencherTermo,
--     Backend 4), depois de conferir sha256(body) = body_sha256; o banco não preenche texto.
--   - private.document_insert_signed_authorization: a mesma assinatura de 8 parâmetros; passa a exigir tenant.legal_name
--     e tenant.trade_name iguais ao cadastro e tenant.cnpj com os mesmos dígitos (o payload pode trazer o CNPJ formatado).
-- Sempre para a frente.

create function api.propass_authorization_context(p_secret_hash bytea)
returns table (legal_name text, trade_name text, cnpj text, template_id uuid, version integer, body_sha256 text,
               body_normalization text, body text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v platform.access_grant;
  v_clinica platform.tenant;
  tv documents.template_version;
begin
  select * into v from platform.access_grant g
  where g.secret_hash = p_secret_hash and g.purpose = 'professional_propass';
  if not found or not private.grant_is_valid(v.id, 'professional_propass') then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004', detail = 'grant';
  end if;
  select * into v_clinica from platform.tenant t where t.id = v.tenant_id;
  if v_clinica.legal_name is null then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'legal_name';
  end if;
  if v_clinica.cnpj is null then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'cnpj';
  end if;
  tv := private.authorization_template_version(v.tenant_id);
  if tv.id is null then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'authorization_template';
  end if;
  return query select v_clinica.legal_name, v_clinica.name, v_clinica.cnpj, tv.template_id, tv.version, tv.body_sha256,
                      tv.body_normalization, tv.body;
end;
$$;
revoke all on function api.propass_authorization_context(bytea) from public, anon, authenticated;
grant execute on function api.propass_authorization_context(bytea) to service_role;

create or replace function private.document_insert_signed_authorization(
  p_tenant_id uuid,
  p_professional_link_id uuid,
  p_document_id uuid,
  p_payload_canonical bytea,
  p_atta_code text,
  p_seal_kid text,
  p_seal bytea,
  p_stroke jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v documents.template_version := private.authorization_template_version(p_tenant_id);
  j jsonb;
  v_sha text;
  v_signer text;
  v_signed_at timestamptz;
  v_evidence uuid;
  v_registro text;
  v_clinica platform.tenant;
begin
  if v.id is null then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'authorization_template';
  end if;
  -- o vínculo vivo e o registro do profissional dele, na forma do payload ("CRO-SP 11111"; registroDoConselho no
  -- servidor): o signatário do termo é o profissional deste vínculo, nunca outra pessoa (Segurança no #208)
  select pg_catalog.upper(p.council) || '-' || pg_catalog.upper(p.council_uf) || ' ' || p.council_number
    into v_registro
  from platform.professional_tenant_link l
  join platform.professional p on p.id = l.professional_id
  where l.tenant_id = p_tenant_id and l.id = p_professional_link_id and l.deleted_at is null;
  if v_registro is null then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'professional_link_id';
  end if;
  -- a clínica do payload é a do cadastro: razão social, nome e CNPJ (ADR 0001, "Dados da clínica e texto do Termo";
  -- Tech Lead, 21/11). Sem razão social ou sem CNPJ, nada se assina (decisão do CTO).
  select * into v_clinica from platform.tenant t where t.id = p_tenant_id;
  if v_clinica.legal_name is null then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'legal_name';
  end if;
  if v_clinica.cnpj is null then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'cnpj';
  end if;
  -- um termo vigente por vínculo (a revogação, quando vier, tira o vigente antes de um novo)
  if exists (select 1 from documents.document d
             where d.tenant_id = p_tenant_id and d.professional_link_id = p_professional_link_id
               and d.status = 'assinado_definitivo') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'professional_link_id';
  end if;

  begin
    j := pg_catalog.convert_from(p_payload_canonical, 'UTF8')::jsonb;
  exception when others then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'payload';
  end;
  v_signer := j #>> '{signature,signer}';
  -- o payload descreve exatamente este documento, este modelo de sistema, este vínculo e esta assinatura desenhada
  if j ->> 'atta_sign_version' is distinct from '1'
     or j #>> '{document,id}' is distinct from p_document_id::text
     or j #>> '{document,type}' is distinct from 'termo_de_autorizacao'
     or j #>> '{document,template_id}' is distinct from v.template_id::text
     or (j #>> '{document,template_version}') is distinct from v.version::text
     or j #>> '{document,body_sha256}' is distinct from v.body_sha256
     or j #>> '{document,body_normalization}' is distinct from v.body_normalization
     or j #>> '{context,product}' is distinct from 'atta_in'
     or j #>> '{context,context_type}' is distinct from 'professional_authorization'
     or j #>> '{context,context_id}' is distinct from p_professional_link_id::text
     or j #>> '{tenant,legal_name}' is distinct from v_clinica.legal_name
     or j #>> '{tenant,trade_name}' is distinct from v_clinica.name
     or pg_catalog.regexp_replace(coalesce(j #>> '{tenant,cnpj}', ''), '[^0-9]', '', 'g') is distinct from v_clinica.cnpj
     or j #>> '{signature,level}' is distinct from 'atta_sign'
     or j #>> '{signature,stroke_sha256}' is distinct from p_stroke ->> 'sha256_plain'
     or v_signer is null
     or not exists (select 1 from jsonb_array_elements(coalesce(j -> 'parties', '[]'::jsonb)) p
                    where p ->> 'ref' = v_signer and p ->> 'role' = 'professional' and p ->> 'council' = v_registro) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'payload';
  end if;
  begin
    v_signed_at := (j #>> '{signature,signed_at}')::timestamptz;
  exception when others then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'payload';
  end;

  v_sha := encode(sha256(p_payload_canonical), 'hex');
  if p_atta_code is distinct from private.atta_code_from_sha256(v_sha) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'atta_code';
  end if;
  -- o traço fica no Storage desta clínica e deste documento (revisão da Segurança no #192): um erro do servidor não
  -- aponta a assinatura para o objeto de outra clínica
  -- caminho exato <tenant>/<documento>/<arquivo>, sem '..' nem subpasta, e PNG de até 512 KiB (o teto do servidor;
  -- Segurança no #192)
  if p_stroke is null or (p_stroke ->> 'storage_path') is null
     or not starts_with(p_stroke ->> 'storage_path', p_tenant_id::text || '/' || p_document_id::text || '/')
     or (p_stroke ->> 'storage_path') !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[a-z0-9_-][a-z0-9_.-]{0,79}$'
     or (p_stroke ->> 'storage_path') like '%..%'
     or coalesce((p_stroke ->> 'size_bytes')::bigint, 0) not between 1 and 524288 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'stroke';
  end if;
  -- a chave do selo valia no momento da assinatura (o verifySeal do servidor confere a assinatura Ed25519)
  if p_seal is null or octet_length(p_seal) <> 64
     or not exists (select 1 from documents.seal_key k
                    where k.kid = p_seal_kid and k.valid_from <= v_signed_at
                      and (k.valid_until is null or v_signed_at < k.valid_until)) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'seal';
  end if;

  insert into documents.document (id, tenant_id, template_version_id, professional_link_id, status)
  values (p_document_id, p_tenant_id, v.id, p_professional_link_id, 'assinado_definitivo');
  insert into documents.evidence (tenant_id, document_id, atta_sign_version, payload_canonical, evidence_sha256, atta_code,
                                  code_nonce, signed_at)
  values (p_tenant_id, p_document_id, '1', p_payload_canonical, v_sha, p_atta_code,
          coalesce((j #>> '{extensions,code_nonce}')::integer, 0), v_signed_at)
  returning id into v_evidence;
  insert into documents.seal (tenant_id, evidence_id, kid, signature)
  values (p_tenant_id, v_evidence, p_seal_kid, p_seal);
  insert into documents.stored_object (tenant_id, document_id, role, party_ref, storage_path, sha256_plain, size_bytes,
                                       dek_wrapped, kek_version)
  values (p_tenant_id, p_document_id, 'signature_stroke', v_signer, p_stroke ->> 'storage_path',
          p_stroke ->> 'sha256_plain', (p_stroke ->> 'size_bytes')::integer, decode(p_stroke ->> 'dek_wrapped', 'hex'),
          (p_stroke ->> 'kek_version')::smallint);

  perform audit.record_event('document.sign_authorization', 'documents.document', p_document_id,
    jsonb_build_object('professional_link_id', p_professional_link_id, 'template_version', v.version),
    null, jsonb_build_object('status', 'assinado_definitivo'), p_tenant_id);
  return p_document_id;
end;
$$;
revoke all on function private.document_insert_signed_authorization(uuid, uuid, uuid, bytea, text, text, bytea, jsonb)
  from public, anon, authenticated, service_role;
