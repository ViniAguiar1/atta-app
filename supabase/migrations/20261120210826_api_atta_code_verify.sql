-- MIG-24: verificação pública do Código ATTA. PDD v206 §18.6 (integridade e verificação) e §10.3.3; ADR 0006 §6 do
-- atta-platform: a resposta tem exatamente 8 chaves, sem conteúdo e sem dado pessoal: exists, tenant_trade_name,
-- document_type, template_version, signed_at, status, evidence_sha256, level.
--
-- - Só o servidor chama (service_role), depois do limite de 30 por minuto por IP (src/server/limite.ts, ADR 0004 §2)
--   e da normalização do que a pessoa digitou (normalizeAttaCode). O navegador não pula o limite (ADR 0004 §1).
-- - Código inexistente e malformado dão a mesma resposta (exists = false e o resto nulo): a rota não vira oráculo.
-- - O estabelecimento é o que foi assinado (payload.tenant.trade_name, com legal_name de reserva), não o nome atual
--   da clínica; o momento é evidence.signed_at, o mesmo signature.signed_at do payload (#61, #62).
-- - status é o do ciclo de vida (§17.6). O que a página mostra para Pré-assinado, Cancelado e Substituído é lacuna
--   levada ao CTO/PO; por ora, só a existência e o estado, sem conteúdo (combinado com o Backend 3).
-- - Só a consulta que encontrou o documento deixa atta_code.verify na trilha (log de acesso, escopo de rede), com o
--   tenant do documento e sem o código no detalhe; a que não encontrou vai só para o log da aplicação.
-- Sempre para a frente.

insert into audit.action (action, kind, scope) values ('atta_code.verify', 'access', 'network')
on conflict (action) do nothing;

create function api.atta_code_verify(p_code text)
returns table ("exists" boolean, tenant_trade_name text, document_type text, template_version integer, signed_at text,
               status text, evidence_sha256 text, level text)
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

  -- não encontrado não vai à trilha: a cabeça da cadeia é uma linha só (audit.chain_head, FOR UPDATE), e uma consulta
  -- anônima em massa com códigos inexistentes disputaria essa trava com as ações de todas as clínicas (Tech Lead,
  -- Segurança e Backend 3 no #114). O servidor registra o "não encontrado" no log da aplicação, sem o código.
  if v_tenant is null then
    return query select false, null::text, null::text, null::integer, null::text, null::text, null::text, null::text;
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
    v_payload #>> '{signature,level}';
end;
$$;

revoke all on function api.atta_code_verify(text) from public, anon, authenticated;
grant execute on function api.atta_code_verify(text) to service_role;
