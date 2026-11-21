-- MIG-14b (parte 3): o passo 2 do PROpass e o PIN do profissional reaproveitado (PDD v206 §10.4.3; ADR 0001 §1; ADR
-- 0004 §3; pedido do Frontend 6 para a porta real). O contexto do Termo (api.propass_authorization_context) e o
-- preencherTermo são do Backend 3 (ADR 0001, "Dados da clínica e texto do Termo").
--   1. api.propass_identity_check: o passo 2 decide se a tela pede a senha ou se o profissional usa a que já tem
--      (Frontend 6), SEM virar oráculo de CPF (Tech Lead, 21/11): para o servidor, só duas respostas.
--        - 'usar_pin_existente': conselho, CPF e o e-mail do convite batem com um profissional que já tem PIN. Só o
--          próprio profissional sabe os três (o e-mail é o do convite, travado).
--        - 'pedir_pin': todo o resto: o profissional novo, o que já existe sem PIN e o que não confere (conselho ou CPF
--          de outro). Não há como distinguir "não existe" de "não confere". No caso do existente sem PIN (identidade
--          inteira conferida), a resposta leva o professional_id, para o servidor calcular o pin_mac; o servidor nunca o
--          devolve ao navegador.
--      Mesmo assim, 'usar_pin_existente' só aparece com o CPF certo: com o link e o conselho (público), daria para testar
--      CPFs. Por isso há limite por link aqui dentro, no limitador único (api.rate_limit_hit, ADR 0004 §2): 10 por hora
--      por link (bucket propass.identity.link, chave sha256 do id do grant, que não se reverte); excedido, 54000
--      (LIMITE). O limite por IP fica no servidor (propass.submit.ip). A recusa de identidade continua no
--      api.propass_submit, com o contador do link (a 5ª revoga). Tech Lead, 21/11.
--   2. api.propass_submit (mesma assinatura): o reaproveitado sem PIN passa a criar o dele no envio, e o pin_mac_version
--      tem de ser 1 (revisões do Backend 2 e do Tech Lead no #208).

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Passo 2: pedir a senha ou usar a que já existe
-- ---------------------------------------------------------------------------------------------------------------
create function api.propass_identity_check(p_secret_hash bytea, p_council text, p_council_uf text,
                                           p_council_number text, p_cpf_hmac bytea)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v platform.access_grant;
  v_link platform.professional_tenant_link;
  v_prof platform.professional;
begin
  select * into v from platform.access_grant g
  where g.secret_hash = p_secret_hash and g.purpose = 'professional_propass';
  if not found or not private.grant_is_valid(v.id, 'professional_propass') then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004', detail = 'grant';
  end if;
  -- limite por link, antes de olhar qualquer dado (o incremento fica gravado: só o excesso faz raise)
  if not api.rate_limit_hit('propass.identity.link',
                            extensions.digest('atta.ratelimit.v1|propass.identity.link|' || v.id::text, 'sha256'),
                            10, 3600) then
    raise exception using errcode = '54000', message = 'ATTA-IN-0003', detail = 'rate_limit';
  end if;
  if num_nulls(p_council, p_council_uf, p_council_number, p_cpf_hmac) > 0 or octet_length(p_cpf_hmac) <> 32 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'propass_fields';
  end if;
  select * into v_link from platform.professional_tenant_link l where l.id = v.professional_link_id;
  if v_link.professional_id is not null then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'propass_done';
  end if;
  -- o mesmo profissional que o api.propass_submit reaproveitaria: conselho, CPF e o e-mail do convite, vivo e ainda
  -- não ligado a esta clínica
  select * into v_prof from platform.professional p
  where p.council = p_council and p.council_uf = p_council_uf and p.council_number = p_council_number
    and p.cpf_hmac = p_cpf_hmac and p.email_hmac = v_link.invite_email_hmac and p.deleted_at is null
    and not exists (select 1 from platform.professional_tenant_link l
                    where l.tenant_id = v_link.tenant_id and l.professional_id = p.id and l.deleted_at is null);
  if v_prof.id is not null and exists (select 1 from platform.professional_pin pp where pp.professional_id = v_prof.id) then
    return jsonb_build_object('status', 'usar_pin_existente');
  end if;
  return jsonb_build_object('status', 'pedir_pin', 'professional_id', v_prof.id);
end;
$$;
revoke all on function api.propass_identity_check(bytea, text, text, text, bytea) from public, anon, authenticated;
grant execute on function api.propass_identity_check(bytea, text, text, text, bytea) to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Envio final: PIN do reaproveitado sem PIN e pin_mac_version = 1 (mesma assinatura e mesmos grants do #208)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function api.propass_submit(
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
  if octet_length(p_pin_mac) <> 32 or p_pin_mac_version <> 1 then   -- versão 1 = ATTA_PIN_PEPPER atual (revisão do Backend 2)
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

  -- PIN: o profissional novo cria o dele aqui. O reaproveitado mantém o que já tem; se ainda não tem, cria agora, desde
  -- que o servidor tenha calculado o pin_mac com o id dele (o api.propass_identity_check devolve o id só nesse caso, com
  -- a identidade inteira conferida, e o servidor nunca o mostra). Nunca sobrescreve um PIN que já existe.
  if not v_reused
     or (p_professional_id = v_prof
         and not exists (select 1 from platform.professional_pin pp where pp.professional_id = v_prof)) then
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
