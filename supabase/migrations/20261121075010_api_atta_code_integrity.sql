-- MIG-24 (parte 3): integridade conferida na hora e CNPJ do estabelecimento na verificação pública do Código ATTA.
-- PDD v206 §18.6 (a página retorna "existência, momento de assinatura, estabelecimento e integridade"). Contrato na
-- ADR 0007 (Tech Lead, 21/11): a resposta pública ganha `integrity` ('confere' | 'nao_confere' | null), calculada pelo
-- servidor do Next com o material desta migration, e `tenant_cnpj` (CNPJ aprovado pelo CTO, PLANO "Verificação
-- pública: CNPJ do estabelecimento"; a PO confirma em R29).
--
-- - api.atta_code_verify ganha tenant_cnpj, do payload ASSINADO (tenant.cnpj), nunca do cadastro atual, como o nome.
-- - private.atta_code_material: o que o servidor precisa para recalcular e verificar: o payload canônico, o hash
--   guardado, o signed_at, os selos (kid e assinatura) e as chaves do manifesto desses kids. Sem EXECUTE para a API.
--   api.atta_code_material só para service_role. Nada disso sai na resposta pública: o servidor devolve só o resultado.
-- - Sem trilha aqui: a consulta já gravou atta_code.verify quando o documento existe (ADR 0003 §2b).
-- Sempre para a frente: a verificação muda de forma, então sai e volta com os mesmos grants.

drop function api.atta_code_verify(text);

create function api.atta_code_verify(p_code text)
returns table ("exists" boolean, tenant_trade_name text, document_type text, template_version integer, signed_at text,
               status text, evidence_sha256 text, level text, tenant_cnpj text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid;
  v_payload jsonb;
  v_signed_at timestamptz;
  v_status text;
  v_sha text;
begin
  if p_code is not null and p_code ~ '^ATTA-[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){2}$' then
    select e.tenant_id, pg_catalog.convert_from(e.payload_canonical, 'UTF8')::jsonb, e.signed_at, d.status,
           e.evidence_sha256
      into v_tenant, v_payload, v_signed_at, v_status, v_sha
    from documents.evidence e
    join documents.document d on d.tenant_id = e.tenant_id and d.id = e.document_id
    where e.atta_code = p_code;
  end if;

  -- não encontrado não vai à trilha (cabeça da cadeia única; ADR 0003 §2b)
  if v_tenant is null then
    return query select false, null::text, null::text, null::integer, null::text, null::text, null::text, null::text,
                        null::text;
    return;
  end if;

  perform audit.record_event('atta_code.verify', 'documents.evidence', null,
    pg_catalog.jsonb_build_object('found', true), null, null, v_tenant);

  return query select
    true,
    coalesce(nullif(v_payload #>> '{tenant,trade_name}', ''), v_payload #>> '{tenant,legal_name}'),
    v_payload #>> '{document,type}',
    (v_payload #>> '{document,template_version}')::integer,
    pg_catalog.to_char(v_signed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    v_status,
    v_sha,
    v_payload #>> '{signature,level}',
    nullif(v_payload #>> '{tenant,cnpj}', '');
end;
$$;

revoke all on function api.atta_code_verify(text) from public, anon, authenticated;
grant execute on function api.atta_code_verify(text) to service_role;

-- material da integridade: só do documento que existe; datas em ISO UTC com ms (a forma que o verifySeal aceita) e
-- bytes em base64. Selos ordenados pelo kid, para a verificação ser determinística.
create function private.atta_code_material(p_code text)
returns table (payload_canonical_b64 text, evidence_sha256 text, signed_at text, seals jsonb, seal_keys jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pg_catalog.translate(pg_catalog.encode(e.payload_canonical, 'base64'), e'\n', ''),
    e.evidence_sha256,
    pg_catalog.to_char(e.signed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                'kid', s.kid, 'sig_b64', pg_catalog.translate(pg_catalog.encode(s.signature, 'base64'), e'\n', '')) order by s.kid)
              from documents.seal s where s.tenant_id = e.tenant_id and s.evidence_id = e.id), '[]'::jsonb),
    coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                'kid', k.kid, 'alg', k.alg, 'public_key_spki_b64', pg_catalog.translate(pg_catalog.encode(k.public_key_spki, 'base64'), e'\n', ''),
                'valid_from', pg_catalog.to_char(k.valid_from at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                'valid_until', pg_catalog.to_char(k.valid_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
                order by k.kid)
              from documents.seal_key k
              where k.kid in (select s.kid from documents.seal s where s.tenant_id = e.tenant_id and s.evidence_id = e.id)),
             '[]'::jsonb)
  from documents.evidence e
  where p_code is not null and p_code ~ '^ATTA-[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){2}$'
    and e.atta_code = p_code
$$;
revoke all on function private.atta_code_material(text) from public, anon, authenticated, service_role;

create function api.atta_code_material(p_code text)
returns table (payload_canonical_b64 text, evidence_sha256 text, signed_at text, seals jsonb, seal_keys jsonb)
language sql
stable
security definer
set search_path = ''
as $$ select * from private.atta_code_material(p_code) $$;
revoke all on function api.atta_code_material(text) from public, anon, authenticated;
grant execute on function api.atta_code_material(text) to service_role;
