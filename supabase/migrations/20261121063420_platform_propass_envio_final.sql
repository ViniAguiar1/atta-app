-- MIG-14b (parte 2): o envio final do PROpass, numa transação só (PDD v206 §10.4.3; ADR 0001 §1, bullet "Termo de
-- Autorização e assinatura desenhada", fechado pelo Tech Lead com o Backend 3 e o Backend 4 em 21/11; decisões do CTO no
-- PLANO). O api.propass_submit passa a gravar, tudo ou nada:
--   - os dados que o próprio profissional preencheu (como na parte 1, #129);
--   - o Termo de Autorização assinado pelo ATTA Sign, pela private.document_insert_signed_authorization (Backend 3,
--     #192): documento assinado_definitivo, evidência, selo e o stored_object signature_stroke (a assinatura desenhada,
--     que os documentos de paciente reaproveitam pelo sha256);
--   - o PIN do Boarding Check (decisão do dono, R10; ADR 0004 §3): só o pin_mac, calculado no servidor
--     (src/server/pin/pin.ts, #187), em platform.professional_pin, tabela própria sem grant (Segurança).
-- Com 'ok', o PROpass fica concluído e o link é consumido (grant.revoke, reason 'propass_done'). Nada fica concluído sem
-- termo, nem há termo sem PROpass: qualquer recusa da função do termo (authorization_template, professional_link_id,
-- payload, atta_code, seal) volta o envio inteiro. A recusa de identidade continua devolvendo 'recusado' sem gravar nada
-- além do contador do link (Tech Lead, #129).
-- Aviso de Privacidade do Profissional (decisão do CTO, P2b): o passo fica desligado no stage até a PO mandar o texto
-- oficial. O vínculo passa a exigir só a coerência entre versão e data da ciência, e o p_privacy_notice_version é
-- opcional. A obrigação volta com o texto oficial.

-- ---------------------------------------------------------------------------------------------------------------
-- PIN do Boarding Check: um por profissional (global, como o profissional); conferido pelo Backend 3 no Boarding Check
-- ---------------------------------------------------------------------------------------------------------------
create table platform.professional_pin (
  professional_id uuid primary key references platform.professional (id),
  pin_mac bytea not null,
  pin_mac_version smallint not null,
  set_at timestamptz not null default now(),
  constraint professional_pin_mac_size_check check (octet_length(pin_mac) = 32),
  constraint professional_pin_mac_version_check check (pin_mac_version >= 1)
);
alter table platform.professional_pin enable row level security;
alter table platform.professional_pin force row level security;
revoke all on platform.professional_pin from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Aviso de Privacidade desligado: só a coerência (Tech Lead, 21/11)
-- ---------------------------------------------------------------------------------------------------------------
alter table platform.professional_tenant_link
  drop constraint professional_tenant_link_privacy_check,
  add constraint professional_tenant_link_privacy_check
    check ((privacy_notice_version is null) = (privacy_notice_ack_at is null));

insert into audit.action (action, kind) values ('professional.pin_set', 'change') on conflict (action) do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- api.propass_submit: o envio final (assinatura nova: drop e create)
-- ---------------------------------------------------------------------------------------------------------------
drop function api.propass_submit(bytea, uuid, text, text, text, text, bytea, text, bytea, bytea, bytea, bytea, bytea,
                                 smallint, text, text);

-- O servidor, antes: confere o grant e o limite por IP (src/server/limite.ts, propass.submit.ip), valida com Zod, confere
-- o conselho na mesma requisição (src/server/conselho/porta.ts), decifra o e-mail do convite e cifra os dados
-- (src/server/propass/convite.ts), valida o PIN e calcula o pin_mac com o professional_id que ele gerou
-- (src/server/pin/pin.ts), cifra e sobe o PNG da assinatura e monta o pacote do ATTA Sign
-- (src/server/atta-sign/termo-autorizacao.ts, Backend 3). O banco confere; não cifra, não calcula HMAC nem monta o pacote.
create function api.propass_submit(
  p_secret_hash bytea,
  p_professional_id uuid,             -- gerado no servidor (entra na AAD e no pin_mac); ignorado se o profissional já existe
  p_display_name text,
  p_council text,
  p_council_uf text,
  p_council_number text,
  p_cpf_hmac bytea,
  p_cpf_masked text,
  p_cpf_enc bytea,
  p_phone_enc bytea,
  p_email_hmac bytea,                 -- precisa ser o do convite: e-mail travado
  p_email_enc bytea,
  p_dek_wrapped bytea,
  p_kek_version smallint,
  p_council_status text,              -- 'regularizado' (conferência automática na mesma requisição) | 'nao_consultado'
  p_pin_mac bytea,                    -- HMAC do PIN com o p_professional_id (src/server/pin/pin.ts)
  p_pin_mac_version smallint,
  p_document_id uuid,                 -- o Termo de Autorização: gerado no servidor, o mesmo document.id do payload
  p_payload_canonical bytea,          -- JCS do pacote do ATTA Sign
  p_atta_code text,
  p_seal_kid text,
  p_seal bytea,
  p_stroke jsonb,                     -- {storage_path, sha256_plain, size_bytes, dek_wrapped (hex), kek_version}
  p_privacy_notice_version text default null   -- nulo enquanto o Aviso estiver desligado (P2b)
) returns text                        -- 'ok' ou 'recusado' (identidade que não confere; contada no link)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v platform.access_grant;
  v_link platform.professional_tenant_link;
  v_by_council platform.professional;
  v_by_cpf uuid;
  v_prof uuid;
  v_reused boolean := false;
  v_refused boolean := false;
  v_failures smallint;
  v_pin_set boolean := false;
  v_notice text := nullif(btrim(coalesce(p_privacy_notice_version, '')), '');
begin
  select * into v from platform.access_grant g
  where g.secret_hash = p_secret_hash and g.purpose = 'professional_propass';
  if not found or not private.grant_is_valid(v.id, 'professional_propass') then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004', detail = 'grant';
  end if;
  select * into v_link from platform.professional_tenant_link l where l.id = v.professional_link_id for update;
  if v_link.professional_id is not null then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'propass_done';
  end if;
  if num_nulls(p_professional_id, p_display_name, p_council, p_council_uf, p_council_number, p_cpf_hmac, p_cpf_masked,
               p_cpf_enc, p_phone_enc, p_email_hmac, p_email_enc, p_dek_wrapped, p_kek_version, p_pin_mac,
               p_pin_mac_version, p_document_id, p_payload_canonical, p_atta_code, p_seal_kid, p_seal, p_stroke) > 0 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'propass_fields';
  end if;
  if octet_length(p_pin_mac) <> 32 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'pin';
  end if;
  if p_email_hmac is distinct from v_link.invite_email_hmac then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'email';
  end if;
  if p_council_status not in ('regularizado', 'nao_consultado') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'council';
  end if;

  -- identidade (parte 1, #129): conselho existente só liga com o mesmo CPF e o mesmo e-mail; CPF de outro, profissional
  -- excluído ou já ligado a esta clínica também não. A mesma resposta, sem raise, para o contador ficar gravado; a 5ª
  -- recusa revoga o link. Nenhum termo nem PIN é gravado numa recusa.
  select * into v_by_council from platform.professional p
  where p.council = p_council and p.council_uf = p_council_uf and p.council_number = p_council_number;
  select p.id into v_by_cpf from platform.professional p where p.cpf_hmac = p_cpf_hmac;
  v_refused := (v_by_council.id is not null and v_by_council.cpf_hmac is distinct from p_cpf_hmac)
               or (v_by_cpf is not null and v_by_council.id is null)
               or (v_by_council.id is not null and v_by_council.deleted_at is not null)
               or (v_by_council.id is not null and v_by_council.email_hmac is distinct from v_link.invite_email_hmac)
               or exists (select 1 from platform.professional_tenant_link l
                          where l.tenant_id = v_link.tenant_id and l.professional_id = v_by_council.id
                            and l.deleted_at is null);
  if v_refused then
    update platform.access_grant g set propass_failures = g.propass_failures + 1, last_used_at = now(),
           revoked_at = case when g.propass_failures + 1 >= 5 then now() else g.revoked_at end
    where g.id = v.id
    returning g.propass_failures into v_failures;
    perform audit.record_event('propass.refused', 'platform.professional_tenant_link', v_link.id,
      jsonb_build_object('attempt', v_failures), null, null, v_link.tenant_id);
    if v_failures >= 5 then
      perform audit.record_event('grant.revoke', 'platform.access_grant', v.id,
        jsonb_build_object('purpose', 'professional_propass', 'reason', 'propass_attempts'), null, null, v_link.tenant_id);
    end if;
    return 'recusado';
  end if;

  if v_by_council.id is not null then
    -- o mesmo profissional, já homologado por outra clínica: liga sem mexer nos dados globais dele
    v_prof := v_by_council.id;
    v_reused := true;
    if p_council_status = 'regularizado' then
      update platform.professional p set council_status = 'regularizado', council_verified_at = now(), updated_at = now()
      where p.id = v_prof;
    end if;
  else
    insert into platform.professional (id, display_name, council, council_uf, council_number, cpf_hmac, cpf_masked,
                                       cpf_enc, phone_enc, email_hmac, email_enc, dek_wrapped, kek_version,
                                       council_status, council_verified_at)
    values (p_professional_id, btrim(p_display_name), p_council, p_council_uf, p_council_number, p_cpf_hmac,
            p_cpf_masked, p_cpf_enc, p_phone_enc, p_email_hmac, p_email_enc, p_dek_wrapped, p_kek_version,
            p_council_status, case when p_council_status = 'regularizado' then now() end);
    v_prof := p_professional_id;
  end if;

  -- o vínculo precisa estar concluído antes do termo (CHECK professional_tenant_link_propass_check e a função do termo)
  update platform.professional_tenant_link l
  set professional_id = v_prof, propass_completed_at = now(), privacy_notice_version = v_notice,
      privacy_notice_ack_at = case when v_notice is not null then now() end, updated_at = now()
  where l.id = v_link.id;

  -- Termo de Autorização (Backend 3): confere o pacote e grava. Qualquer recusa dela volta o envio inteiro.
  perform private.document_insert_signed_authorization(v_link.tenant_id, v_link.id, p_document_id, p_payload_canonical,
                                                        p_atta_code, p_seal_kid, p_seal, p_stroke);

  -- PIN: o profissional novo cria o dele aqui. O reaproveitado mantém o que já tem (o pin_mac depende do id dele, que o
  -- servidor não conhece antes; sem PIN, ele cria pela redefinição por e-mail).
  if not v_reused then
    insert into platform.professional_pin (professional_id, pin_mac, pin_mac_version)
    values (v_prof, p_pin_mac, p_pin_mac_version);
    v_pin_set := true;
    perform audit.record_event('professional.pin_set', 'platform.professional_pin', v_prof,
      jsonb_build_object('via', 'propass'), null, null, v_link.tenant_id);
  end if;

  -- o link do PROpass é consumido
  update platform.access_grant g set revoked_at = now(), last_used_at = now() where g.id = v.id;
  perform audit.record_event('grant.revoke', 'platform.access_grant', v.id,
    jsonb_build_object('purpose', 'professional_propass', 'reason', 'propass_done'), null, null, v_link.tenant_id);
  perform audit.record_event('propass.submit', 'platform.professional_tenant_link', v_link.id,
    jsonb_build_object('reused_professional', v_reused, 'privacy_notice_version', v_notice,
                       'council_status', p_council_status, 'pin_set', v_pin_set, 'document_id', p_document_id),
    null, jsonb_build_object('professional_id', v_prof), v_link.tenant_id);
  return 'ok';
end;
$$;

revoke all on function api.propass_submit(bytea, uuid, text, text, text, text, bytea, text, bytea, bytea, bytea, bytea,
                                          bytea, smallint, text, bytea, smallint, uuid, bytea, text, text, bytea, jsonb, text)
  from public, anon, authenticated;
grant execute on function api.propass_submit(bytea, uuid, text, text, text, text, bytea, text, bytea, bytea, bytea, bytea,
                                             bytea, smallint, text, bytea, smallint, uuid, bytea, text, text, bytea, jsonb, text)
  to service_role;
