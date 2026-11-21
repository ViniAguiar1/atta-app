-- MIG-21c (parte 1, banco) · Termo de Autorização de Uso de Imagem de Assinatura Digital (Profissional).
-- PDD v206 §10.4.3 (nasce Assinado, sem Pré-assinado, com hash e Código ATTA; cláusulas do termo); decisões do CTO
-- de 21/11 (PLANO, "Termo de Autorização do profissional"): texto do simulador (captura 26) completado com as
-- cláusulas do PDD, provisório até a PO (P2c); modelo de SISTEMA, publicado pela ATTA por seed em cada clínica e na
-- clínica nova; versão nova só por migration. ADR 0001 §1 (Tech Lead, 21/11): uma transação só, dentro do
-- api.propass_submit (Backend 4), que chama a private.document_insert_signed_authorization desta migration.
-- A trava que impede a clínica de criar, editar, inativar ou publicar esse kind é do Backend 6 (documents.template).
-- Sempre para a frente.

-- ---------------------------------------------------------------------------------------------------------------
-- Código ATTA a partir do hash (RFC-0020 D-1): "ATTA-" + 12 símbolos Crockford dos 60 bits mais significativos do
-- evidence_sha256. O servidor calcula; o banco confere (vetores caso-01 e caso-02 no pgTAP).
-- ---------------------------------------------------------------------------------------------------------------
create function private.atta_code_from_sha256(p_sha256 text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select 'ATTA-' || substr(s, 1, 4) || '-' || substr(s, 5, 4) || '-' || substr(s, 9, 4)
  from (
    select string_agg(substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ',
             (((('x' || lpad(substr(p_sha256, 1, 15), 16, '0'))::bit(64)::bigint) >> (55 - 5 * i)) & 31)::int + 1, 1),
             '' order by i) as s
    from pg_catalog.generate_series(0, 11) as i
  ) x
  where p_sha256 ~ '^[0-9a-f]{64}$'
$$;
revoke all on function private.atta_code_from_sha256(text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Modelo de sistema. A versão publicada pela ATTA tem published_by fixo (o "usuário" ATTA, que não existe em
-- auth.users): é por ele que o banco reconhece o modelo de sistema, sem coluna nova em documents.template.
-- Campos {{...}} são preenchidos pelo servidor na hora de montar o documento (razão social, CNPJ e nome da clínica;
-- nome e registro do profissional); o body_sha256 do payload é o desta versão, com os campos (como o caso-02).
-- O item de ciência do Aviso de Privacidade do Profissional (PDD §10.4.3) fica de fora enquanto o Aviso estiver
-- desligado (decisão do CTO, P2b): volta numa versão nova, com o texto oficial.
-- ---------------------------------------------------------------------------------------------------------------
create function private.atta_system_user_id()
returns uuid
language sql
immutable
set search_path = ''
as $$ select '00000000-0000-4000-8000-00000000a77a'::uuid $$;
revoke all on function private.atta_system_user_id() from public, anon, authenticated, service_role;

create function private.authorization_template_body_v1()
returns text
language sql
immutable
set search_path = ''
as $$ select private.normalize_document_body(
'Termo de Autorização de Uso de Imagem de Assinatura Digital

Eu, {{profissional.nome}}, inscrita(o) no {{profissional.registro}}, autorizo {{clinica.razao_social}} (CNPJ {{clinica.cnpj}}), estabelecimento "{{clinica.nome}}", a:

(i) reproduzir digitalmente a imagem da minha assinatura manuscrita, capturada nesta tela, neste momento;

(ii) aplicar essa imagem, sempre acompanhada do ATTA Sign (resumo criptográfico SHA-256, data e hora e origem), exclusivamente aos documentos vinculados aos atendimentos realizados por mim neste estabelecimento;

(iii) guardar o histórico das assinaturas aplicadas pelo prazo legal de retenção.

Declaro ciência de que os documentos dos meus atendimentos seguem o modelo de quatro estados (Pré-assinado → Assinado definitivo) e só se tornam Assinado definitivo depois que eu confirmo a conclusão do atendimento correspondente. Não existe assinatura definitiva automática.

Declaro ciência de que esta autorização vale somente para os procedimentos em que estou habilitada(o) pelo meu conselho profissional e autorizada(o) por este estabelecimento.

Declaro ciência de que esta autorização não transfere nem altera a minha responsabilidade técnica e ética perante o meu conselho profissional.

Declaro ciência de que o gestor deste estabelecimento pode acessar o resumo estruturado do atendimento que eu preencher, e de que cada acesso fica registrado em log de auditoria.

Esta autorização vigora por prazo indeterminado e cessa com a minha saída deste estabelecimento. Os termos que eu tiver assinado com outros estabelecimentos que usam o ATTA continuam vigentes.

Posso revogar esta autorização a qualquer momento, com efeito prospectivo: os documentos assinados antes da revogação continuam válidos.

Fundamento: art. 10, § 2º, da Medida Provisória nº 2.200-2/2001, que admite o documento eletrônico com meio de comprovação de autoria diferente da ICP-Brasil quando aceito pelas partes, como este termo formaliza.

Fim do documento · {{clinica.razao_social}} · CNPJ {{clinica.cnpj}}') $$;
revoke all on function private.authorization_template_body_v1() from public, anon, authenticated, service_role;

-- a versão vigente do modelo de sistema da clínica (nula se não houver)
create function private.authorization_template_version(p_tenant_id uuid)
returns documents.template_version
language sql
stable
security definer
set search_path = ''
as $$
  select v.*
  from documents.template t
  join documents.template_version v on v.tenant_id = t.tenant_id and v.template_id = t.id and v.version = t.current_version
  where t.tenant_id = p_tenant_id and t.kind = 'termo_de_autorizacao' and t.status = 'ativo'
    and v.published_by = private.atta_system_user_id()
  order by t.created_at, t.id
  limit 1
$$;
revoke all on function private.authorization_template_version(uuid) from public, anon, authenticated, service_role;

-- para o api.propass_submit conferir antes de aceitar o envio (recusa 'authorization_template')
create function private.authorization_template_ready(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select (private.authorization_template_version(p_tenant_id)).id is not null $$;
revoke all on function private.authorization_template_ready(uuid) from public, anon, authenticated, service_role;

-- seed: cria o modelo de sistema Ativo v1 na clínica que ainda não tem (idempotente)
create function private.seed_authorization_template(p_tenant_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_template uuid := gen_random_uuid();
  v_body text := private.authorization_template_body_v1();
begin
  if private.authorization_template_ready(p_tenant_id) then
    return;
  end if;
  insert into documents.template (id, tenant_id, kind, title, frequency, required, draft_body, created_by)
  values (v_template, p_tenant_id, 'termo_de_autorizacao', 'Termo de Autorização de Uso de Imagem de Assinatura Digital',
          'unica', true, v_body, private.atta_system_user_id());
  insert into documents.template_version (tenant_id, template_id, version, kind, title, frequency, required, body,
                                          body_sha256, published_by)
  values (p_tenant_id, v_template, 1, 'termo_de_autorizacao', 'Termo de Autorização de Uso de Imagem de Assinatura Digital',
          'unica', true, v_body, encode(sha256(convert_to(v_body, 'UTF8')), 'hex'), private.atta_system_user_id());
  update documents.template set status = 'ativo', current_version = 1 where id = v_template;
end;
$$;
revoke all on function private.seed_authorization_template(uuid) from public, anon, authenticated, service_role;

select private.seed_authorization_template(t.id) from platform.tenant t;

create function private.tenant_seed_authorization_template()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_authorization_template(new.id);
  return null;
end;
$$;
revoke all on function private.tenant_seed_authorization_template() from public, anon, authenticated, service_role;
create trigger tenant_seed_authorization_template after insert on platform.tenant
  for each row execute function private.tenant_seed_authorization_template();

insert into audit.action (action, kind) values ('document.sign_authorization', 'change') on conflict (action) do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- Gravar o termo assinado. Só o api.propass_submit chama (SECURITY DEFINER, sem token): tenant e vínculo vêm
-- explícitos. O servidor monta o pacote do ATTA Sign (payload JCS, Código ATTA e selo Ed25519, que ele confere antes
-- com verifySeal); o banco confere tudo o que dá para conferir aqui e grava numa transação: o documento já em
-- assinado_definitivo (PDD §10.4.3), a evidência, o selo e a assinatura desenhada (stored_object 'signature_stroke',
-- que é a assinatura reaproveitada nos documentos de paciente enquanto a autorização valer; ADR 0001 §1).
-- Qualquer recusa volta o submit inteiro. p_stroke: {storage_path, sha256_plain, size_bytes, dek_wrapped (hex),
-- kek_version}; o PNG já está cifrado no Storage (getCofre('documents')).
-- ---------------------------------------------------------------------------------------------------------------
create function private.document_insert_signed_authorization(
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
begin
  if v.id is null then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'authorization_template';
  end if;
  if not exists (select 1 from platform.professional_tenant_link l
                 where l.tenant_id = p_tenant_id and l.id = p_professional_link_id and l.deleted_at is null) then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'professional_link_id';
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
     or j #>> '{signature,level}' is distinct from 'atta_sign'
     or j #>> '{signature,stroke_sha256}' is distinct from p_stroke ->> 'sha256_plain'
     or v_signer is null
     or not exists (select 1 from jsonb_array_elements(coalesce(j -> 'parties', '[]'::jsonb)) p
                    where p ->> 'ref' = v_signer and p ->> 'role' = 'professional') then
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
