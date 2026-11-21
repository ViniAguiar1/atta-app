-- MIG-14b: grant do download dos dois PDFs do fim do PROpass (o Termo assinado e a cópia dos dados), pela ADR 0001,
-- §"Download dos PDFs no fim do PROpass" (Tech Lead; PDD v206 §10.4.3, "Download em PDF"):
--   - purpose 'propass_download', preso ao vínculo, emitido na MESMA transação do api.propass_submit e só quando o envio
--     grava (nunca na recusa);
--   - 30 minutos absolutos (sem inatividade e sem renovar por uso) e no máximo 20 downloads. O teto fica na política
--     (private.grant_max_uses, ao lado do private.grant_policy) e em src/server/grant/politica.ts, em paridade;
--   - o contador use_count sobe pelo private.grant_use, que o download (api.propass_download_context, Backend 3)
--     chama a cada arquivo: false = vencido, revogado, acima do teto ou vínculo excluído, a mesma resposta (sem oráculo).

alter table platform.access_grant
  add column use_count smallint not null default 0,
  add constraint access_grant_use_count_check check (use_count >= 0),
  -- contador de usos só no download dos PDFs
  add constraint access_grant_use_count_purpose_check check (purpose = 'propass_download' or use_count = 0),
  drop constraint access_grant_purpose_check,
  add constraint access_grant_purpose_check
    check (purpose in ('patient_checkin', 'professional_boarding', 'professional_propass', 'propass_download')),
  drop constraint access_grant_subject_check,
  add constraint access_grant_subject_check check (
    (purpose = 'patient_checkin' and person_id is not null and professional_link_id is null
     and appointment_id is not null)
    or (purpose = 'professional_boarding' and professional_link_id is not null and person_id is null
        and appointment_id is not null)
    or (purpose in ('professional_propass', 'propass_download') and professional_link_id is not null
        and person_id is null and appointment_id is null));

create or replace function private.grant_policy(p_purpose text, out idle interval, out ceiling interval)
language sql immutable set search_path = ''
as $$
  select case p_purpose when 'patient_checkin' then interval '30 minutes' end,
         case p_purpose when 'patient_checkin' then interval '2 hours'
                        when 'professional_boarding' then interval '8 hours'
                        when 'professional_propass' then interval '7 days'      -- PDD §10.4.3
                        when 'propass_download' then interval '30 minutes' end  -- ADR 0001 (download dos PDFs)
$$;

-- teto de usos por finalidade; nulo = sem teto (o grant vale até vencer ou ser revogado)
create function private.grant_max_uses(p_purpose text) returns int
language sql immutable set search_path = ''
as $$
  select case p_purpose when 'propass_download' then 20 end
$$;
revoke all on function private.grant_max_uses(text) from public, anon, authenticated, service_role;

create or replace function private.grant_is_valid(p_grant_id uuid, p_purpose text) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v platform.access_grant;
  v_policy record;
  v_max int;
begin
  select * into v from platform.access_grant g where g.id = p_grant_id;
  if not found or v.purpose is distinct from p_purpose or v.revoked_at is not null then
    return false;
  end if;
  select * into v_policy from private.grant_policy(v.purpose);
  if v_policy.ceiling is null or now() >= v.expires_at
     or (v.purpose in ('patient_checkin', 'professional_propass', 'propass_download')
         and now() >= v.created_at + v_policy.ceiling) then
    return false;
  end if;
  if v_policy.idle is not null and now() >= coalesce(v.last_used_at, v.created_at) + v_policy.idle then
    return false;
  end if;
  -- teto de usos (download dos PDFs: 20)
  v_max := private.grant_max_uses(v.purpose);
  if v_max is not null and v.use_count >= v_max then
    return false;
  end if;
  -- profissional: só depois do envio do link, e até 8 h dele (RN-FIC-07)
  if v.purpose = 'professional_boarding' and (v.sent_at is null or now() >= v.sent_at + v_policy.ceiling) then
    return false;
  end if;
  -- link do profissional (PROpass, Boarding Check e download dos PDFs): só enquanto o vínculo existe. A clínica excluiu
  -- o profissional (PDD §10.4.3, "Excluir") = os links dele param de valer na hora (revisão do Backend 4 no #59)
  if v.purpose in ('professional_propass', 'professional_boarding', 'propass_download') and not exists (
       select 1 from platform.professional_tenant_link l
       where l.id = v.professional_link_id and l.tenant_id = v.tenant_id and l.deleted_at is null) then
    return false;
  end if;
  return true;
end;
$$;

-- Conta um uso do grant, se ele vale e está abaixo do teto. Devolve false no resto (sem dizer por quê). O teto fica num
-- lugar só: quem baixa (Backend 3) não conhece o número. O update trava a linha: dois downloads ao mesmo tempo no 20º
-- não passam os dois.
create function private.grant_use(p_grant_id uuid, p_purpose text) returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.grant_is_valid(p_grant_id, p_purpose) then
    return false;
  end if;
  update platform.access_grant g set use_count = g.use_count + 1, last_used_at = now()
  where g.id = p_grant_id and g.revoked_at is null
    and (private.grant_max_uses(g.purpose) is null or g.use_count < private.grant_max_uses(g.purpose));
  return found;
end;
$$;
revoke all on function private.grant_use(uuid, text) from public, anon, authenticated, service_role;

-- O emissor e o leitor genéricos (#59) não servem ao download dos PDFs: o grant nasce só no api.propass_submit e cada
-- uso passa pelo private.grant_use. Mesma assinatura e mesmos grants; só as linhas da trava são novas.
create or replace function api.grant_issue(
  p_purpose text,
  p_secret_hash bytea,
  p_tenant_id uuid,
  p_appointment_id uuid,
  p_person_id uuid default null,
  p_professional_link_id uuid default null
) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_ceiling interval := (select ceiling from private.grant_policy(p_purpose));
  v_id uuid;
begin
  -- o emissor genérico é só dos links de atendimento; PROpass e download dos PDFs nascem nas funções deles (convite e
  -- api.propass_submit), presos ao vínculo (Segurança, revisão do #312)
  if v_ceiling is null or p_purpose not in ('patient_checkin', 'professional_boarding') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'purpose';
  end if;
  if p_secret_hash is null or octet_length(p_secret_hash) <> 32 or p_tenant_id is null or p_appointment_id is null then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'grant';
  end if;
  insert into platform.access_grant (purpose, tenant_id, person_id, professional_link_id, appointment_id, secret_hash,
                                     expires_at)
  values (p_purpose, p_tenant_id, p_person_id, p_professional_link_id, p_appointment_id, p_secret_hash, now() + v_ceiling)
  returning id into v_id;
  perform audit.record_event('grant.issue', 'platform.access_grant', v_id,
    jsonb_build_object('purpose', p_purpose, 'appointment_id', p_appointment_id), null, null, p_tenant_id);
  return v_id;
end;
$$;

create or replace function api.grant_resolve(p_secret_hash bytea, p_purpose text)
returns table (grant_id uuid, tenant_id uuid, person_id uuid, professional_link_id uuid, appointment_id uuid,
               expires_at timestamptz)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v platform.access_grant;
begin
  select * into v from platform.access_grant g where g.secret_hash = p_secret_hash;
  -- o download dos PDFs conta cada uso pelo private.grant_use (teto de 20); resolver sem contar não é caminho dele
  -- (Segurança, revisão do #312): a mesma resposta de vencido
  if not found or p_purpose = 'propass_download' or not private.grant_is_valid(v.id, p_purpose) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004', detail = 'grant';
  end if;
  update platform.access_grant g set last_used_at = now() where g.id = v.id;
  return query select v.id, v.tenant_id, v.person_id, v.professional_link_id, v.appointment_id, v.expires_at;
end;
$$;

-- api.propass_submit ganha p_download_secret_hash (no fim, com default): mudar a assinatura pede drop + create. O corpo
-- é o do 20261121114105, mais a conferência do tamanho do hash e a emissão do grant no envio gravado.
drop function api.propass_submit(bytea, uuid, text, text, text, text, bytea, text, bytea, bytea, bytea, bytea, bytea,
                                 smallint, text, bytea, smallint, uuid, bytea, text, text, bytea, jsonb, text);

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
  p_privacy_notice_version text default null,  -- nulo enquanto o Aviso estiver desligado (P2b)
  p_download_secret_hash bytea default null     -- sha256 do segredo do download dos PDFs (ADR 0001); nulo = sem grant
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
  v_download uuid;
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
               p_cpf_enc, p_phone_enc, p_email_hmac, p_email_enc, p_dek_wrapped, p_kek_version,
               p_document_id, p_payload_canonical, p_atta_code, p_seal_kid, p_seal, p_stroke) > 0 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'propass_fields';
  end if;
  -- o PIN é opcional aqui: só vai junto quando um PIN vai ser criado (decidido abaixo, depois da identidade). Quando vai,
  -- 32 bytes e a versão 1 (= ATTA_PIN_PEPPER atual; revisões do Backend 2 e do Tech Lead no #208 e no #247)
  if (p_pin_mac is null) <> (p_pin_mac_version is null)
     or (p_pin_mac is not null and (octet_length(p_pin_mac) <> 32 or p_pin_mac_version <> 1)) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'pin';
  end if;
  if p_email_hmac is distinct from v_link.invite_email_hmac then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'email';
  end if;
  if p_download_secret_hash is not null and octet_length(p_download_secret_hash) <> 32 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'download_secret';
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

  -- PIN, pela identidade (Tech Lead e Backend 2 no #247): o profissional novo e o reaproveitado ainda sem PIN criam o
  -- dele agora, e então o pin_mac é obrigatório (no reaproveitado, calculado com o id dele, que só o passo 2 dá); o
  -- reaproveitado que já tem PIN usa o dele, e então nenhum PIN pode vir junto. Fora disso: ATTA-IN-0001 pin.
  v_reused := v_by_council.id is not null;
  v_pin_set := not v_reused
               or not exists (select 1 from platform.professional_pin pp where pp.professional_id = v_by_council.id);
  if (v_pin_set and (p_pin_mac is null or (v_reused and p_professional_id is distinct from v_by_council.id)))
     or (not v_pin_set and p_pin_mac is not null) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'pin';
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

  -- PIN (a decisão foi tomada acima, antes de gravar qualquer coisa). Nunca sobrescreve um PIN que já existe.
  if v_pin_set then
    insert into platform.professional_pin (professional_id, pin_mac, pin_mac_version)
    values (v_prof, p_pin_mac, p_pin_mac_version);
    perform audit.record_event('professional.pin_set', 'platform.professional_pin', v_prof,
      jsonb_build_object('via', 'propass'), null, null, v_link.tenant_id);
  end if;

  -- o link do PROpass é consumido
  update platform.access_grant g set revoked_at = now(), last_used_at = now() where g.id = v.id;
  perform audit.record_event('grant.revoke', 'platform.access_grant', v.id,
    jsonb_build_object('purpose', 'professional_propass', 'reason', 'propass_done'), null, null, v_link.tenant_id);
  -- o download dos dois PDFs do fim do PROpass (ADR 0001, "Download dos PDFs no fim do PROpass"): 30 minutos
  -- absolutos, no máximo 20 downloads, preso ao vínculo; só existe com o envio gravado (nunca na recusa)
  if p_download_secret_hash is not null then
    insert into platform.access_grant (purpose, tenant_id, professional_link_id, secret_hash, expires_at)
    values ('propass_download', v_link.tenant_id, v_link.id, p_download_secret_hash,
            now() + (select ceiling from private.grant_policy('propass_download')))
    returning id into v_download;
    perform audit.record_event('grant.issue', 'platform.access_grant', v_download,
      jsonb_build_object('purpose', 'propass_download', 'professional_link_id', v_link.id), null, null, v_link.tenant_id);
  end if;
  perform audit.record_event('propass.submit', 'platform.professional_tenant_link', v_link.id,
    jsonb_build_object('reused_professional', v_reused, 'privacy_notice_version', v_notice,
                       'council_status', p_council_status, 'pin_set', v_pin_set, 'document_id', p_document_id),
    null, jsonb_build_object('professional_id', v_prof), v_link.tenant_id);
  return 'ok';
end;
$$;
revoke all on function api.propass_submit(bytea, uuid, text, text, text, text, bytea, text, bytea, bytea, bytea, bytea,
                                          bytea, smallint, text, bytea, smallint, uuid, bytea, text, text, bytea, jsonb,
                                          text, bytea) from public, anon, authenticated;
grant execute on function api.propass_submit(bytea, uuid, text, text, text, text, bytea, text, bytea, bytea, bytea, bytea,
                                             bytea, smallint, text, bytea, smallint, uuid, bytea, text, text, bytea, jsonb,
                                             text, bytea) to service_role;
