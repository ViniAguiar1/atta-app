-- MIG-14b (parte 1): PROpass, o auto-preenchimento do profissional pelo link do convite.
--
-- PDD v206 §10.4.3 (texto literal em Shared/atta/migracao/pdd/pdd-10-4-3-equipe.md):
--   - "ao ser cadastrado, recebe e-mail com link do PROpass exclusivo"; "O link do PROpass vale 7 dias; 'Reenviar Link'
--     gera um link novo e invalida o anterior (decisão da PO, 18/11/2026)";
--   - "O convite por e-mail leva o próprio profissional a uma tela de auto-preenchimento (não é a clínica que preenche
--     os dados dele)": nome completo, e-mail profissional (travado, o mesmo do convite), CPF, conselho + número de
--     registro + UF, WhatsApp de contato;
--   - "Camada 1 — Validação ATTA (Conselho)": conferência automática do registro (simulada), sem comprovante;
--   - "Aviso de Privacidade do Profissional": apresentado antes do Termo, "com a confirmação de leitura do profissional".
--
-- Desenho (combinado com o Tech Lead e o Backend 2, 20/11; ADR 0001 §1 e ADR 0004 §3):
--   - o link é um grant (platform.access_grant) com purpose professional_propass, preso ao vínculo
--     (professional_link_id) e sem atendimento; vale 7 dias da emissão, sem inatividade. A regra fica só em
--     private.grant_policy e private.grant_is_valid;
--   - o convite e o "Reenviar Link" emitem o link na mesma transação (private.propass_issue), e o reenvio revoga o
--     anterior: nenhum convite fica sem link e nenhum link antigo sobrevive;
--   - o segredo vai no caminho (/propass/<segredo>); o GET não consome. O link vale enquanto o PROpass não termina
--     (o Termo de Autorização, com o Backend 3, é a última etapa e revoga o link na parte 2);
--   - o link do Boarding Check também morre quando a clínica exclui o profissional (o vínculo), como o do PROpass;
--   - conselho que já existe só liga ao profissional existente com o mesmo cpf_hmac e o mesmo e-mail do convite
--     (email_hmac; Security Engineer), sem mexer nos dados globais dele;
--     a recusa conta no link e a 5ª o revoga (o número do conselho é público: sem isso, o link vira oráculo de CPF);
--     conselho existente com outro CPF, ou CPF de outro profissional: o mesmo erro genérico, sem dizer qual.

-- ---------------------------------------------------------------------------------------------------------------
-- Colunas novas
-- ---------------------------------------------------------------------------------------------------------------
alter table platform.professional
  -- Camada 1 (conferência do registro no conselho). Enquanto a consulta real não existir (R20, com a PO), a porta de
  -- produção responde nao_consultado, e a tela não afirma a regularidade (Tech Lead Frontend, #127). council_verified_at
  -- só existe com consulta de verdade. 'nao_confere' nunca grava.
  -- e-mail do profissional (o do convite, travado), como HMAC: um profissional que já existe só se liga a outra clínica
  -- pelo mesmo e-mail (Security Engineer, S2 no #129; PDD §10.4.3, "travado, é o mesmo pra onde o convite foi enviado")
  add column email_hmac bytea,
  add constraint professional_email_hmac_size_check check (octet_length(email_hmac) = 32),
  add column council_status text,
  add column council_verified_at timestamptz,
  add constraint professional_council_status_check check (council_status in ('regularizado', 'nao_consultado')),
  add constraint professional_council_verified_check
    check ((council_status = 'regularizado') = (council_verified_at is not null));

alter table platform.professional_tenant_link
  add column privacy_notice_version text,
  add column privacy_notice_ack_at timestamptz,
  add constraint professional_tenant_link_privacy_check
    check ((privacy_notice_version is null) = (privacy_notice_ack_at is null)
           and (propass_completed_at is null or privacy_notice_ack_at is not null));

-- ---------------------------------------------------------------------------------------------------------------
-- Grant do link do PROpass
-- ---------------------------------------------------------------------------------------------------------------
alter table platform.access_grant
  -- recusas de identidade no envio do PROpass (conselho ou CPF de outro): na 5ª, o link é revogado (Tech Lead, #129)
  add column propass_failures smallint not null default 0,
  alter column appointment_id drop not null,
  drop constraint access_grant_purpose_check,
  add constraint access_grant_purpose_check
    check (purpose in ('patient_checkin', 'professional_boarding', 'professional_propass')),
  drop constraint access_grant_subject_check,
  add constraint access_grant_subject_check check (
    (purpose = 'patient_checkin' and person_id is not null and professional_link_id is null
     and appointment_id is not null)
    or (purpose = 'professional_boarding' and professional_link_id is not null and person_id is null
        and appointment_id is not null)
    or (purpose = 'professional_propass' and professional_link_id is not null and person_id is null
        and appointment_id is null));

-- no máximo um link do PROpass vivo por vínculo
create unique index access_grant_propass_live_uq on platform.access_grant (professional_link_id)
  where purpose = 'professional_propass' and revoked_at is null;

create or replace function private.grant_policy(p_purpose text, out idle interval, out ceiling interval)
language sql immutable set search_path = ''
as $$
  select case p_purpose when 'patient_checkin' then interval '30 minutes' end,
         case p_purpose when 'patient_checkin' then interval '2 hours'
                        when 'professional_boarding' then interval '8 hours'
                        when 'professional_propass' then interval '7 days' end   -- PDD §10.4.3
$$;

create or replace function private.grant_is_valid(p_grant_id uuid, p_purpose text) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v platform.access_grant;
  v_policy record;
begin
  select * into v from platform.access_grant g where g.id = p_grant_id;
  if not found or v.purpose is distinct from p_purpose or v.revoked_at is not null then
    return false;
  end if;
  select * into v_policy from private.grant_policy(v.purpose);
  if v_policy.ceiling is null or now() >= v.expires_at
     or (v.purpose in ('patient_checkin', 'professional_propass') and now() >= v.created_at + v_policy.ceiling) then
    return false;
  end if;
  if v_policy.idle is not null and now() >= coalesce(v.last_used_at, v.created_at) + v_policy.idle then
    return false;
  end if;
  -- profissional: só depois do envio do link, e até 8 h dele (RN-FIC-07)
  if v.purpose = 'professional_boarding' and (v.sent_at is null or now() >= v.sent_at + v_policy.ceiling) then
    return false;
  end if;
  -- link do profissional (PROpass e Boarding Check): só enquanto o vínculo existe. A clínica excluiu o profissional
  -- (PDD §10.4.3, "Excluir") = os links dele param de valer na hora (revisão do Backend 4 no #59)
  if v.purpose in ('professional_propass', 'professional_boarding') and not exists (
       select 1 from platform.professional_tenant_link l
       where l.id = v.professional_link_id and l.tenant_id = v.tenant_id and l.deleted_at is null) then
    return false;
  end if;
  return true;
end;
$$;

-- Emite o link do PROpass de um vínculo e revoga o anterior, na transação de quem chama (convite e reenvio). Fora de
-- api: só as funções que já conferiram tenant e permissão chamam.
create function private.propass_issue(p_tenant_id uuid, p_link_id uuid, p_secret_hash bytea) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_old uuid;
  v_id uuid;
begin
  if p_secret_hash is null or octet_length(p_secret_hash) <> 32 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'propass_secret';
  end if;
  update platform.access_grant g set revoked_at = now()
  where g.professional_link_id = p_link_id and g.purpose = 'professional_propass' and g.revoked_at is null
  returning g.id into v_old;
  if v_old is not null then
    perform audit.record_event('grant.revoke', 'platform.access_grant', v_old,
      jsonb_build_object('purpose', 'professional_propass', 'reason', 'resend'), null, null, p_tenant_id);
  end if;
  insert into platform.access_grant (purpose, tenant_id, professional_link_id, secret_hash, expires_at)
  values ('professional_propass', p_tenant_id, p_link_id, p_secret_hash,
          now() + (select ceiling from private.grant_policy('professional_propass')))
  returning id into v_id;
  perform audit.record_event('grant.issue', 'platform.access_grant', v_id,
    jsonb_build_object('purpose', 'professional_propass', 'professional_link_id', p_link_id), null, null, p_tenant_id);
  return v_id;
end;
$$;
revoke all on function private.propass_issue(uuid, uuid, bytea) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Convite e Reenviar Link (do MIG-14a, #25) passam a emitir o link. A assinatura muda: drop e create.
-- ---------------------------------------------------------------------------------------------------------------
drop function api.professional_invite(uuid, bytea, bytea, uuid, bytea, smallint);
drop function api.professional_resend_invite(uuid, bytea, bytea);

create function api.professional_invite(
  p_id uuid,                          -- id do vínculo, gerado no servidor
  p_invite_email_hmac bytea,
  p_invite_email_enc bytea,
  p_envelope_id uuid,
  p_dek_wrapped bytea,
  p_kek_version smallint,
  p_propass_secret_hash bytea         -- sha256 do segredo que o servidor põe no link do e-mail
) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
begin
  if v_tenant is null or not coalesce((select private.has_permission('team', 'edit')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  -- o e-mail é obrigatório: é para ele que vai o link do PROpass (PDD §10.4.3)
  if num_nulls(p_id, p_invite_email_hmac, p_invite_email_enc, p_envelope_id, p_dek_wrapped, p_kek_version) > 0 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'invite_email';
  end if;
  if exists (select 1 from platform.professional_tenant_link l
             where l.tenant_id = v_tenant and l.invite_email_hmac = p_invite_email_hmac and l.deleted_at is null) then
    raise exception using errcode = '23505', message = 'ATTA-IN-0002', detail = 'invite_email';
  end if;
  insert into platform.professional_tenant_link (id, tenant_id, invite_email_hmac, invite_email_enc, envelope_id,
                                                 dek_wrapped, kek_version)
  values (p_id, v_tenant, p_invite_email_hmac, p_invite_email_enc, p_envelope_id, p_dek_wrapped, p_kek_version);
  perform audit.record_event('professional.invite', 'platform.professional_tenant_link', p_id, '{}');
  perform private.propass_issue(v_tenant, p_id, p_propass_secret_hash);
  return p_id;
end;
$$;

-- Reenviar Link / Editar (PDD §10.4.3): gera um link novo e invalida o anterior. Enquanto o PROpass não foi feito, a
-- clínica pode trocar o e-mail (mesmo envelope). Depois do PROpass não há link a reenviar (o termo novo, depois de uma
-- revogação, é da parte 2). O envio do e-mail é da fila (Integrações).
create function api.professional_resend_invite(
  p_link_id uuid,
  p_propass_secret_hash bytea,
  p_invite_email_hmac bytea default null,
  p_invite_email_enc bytea default null
) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_link platform.professional_tenant_link;
  v_changed boolean;
begin
  if v_tenant is null or not coalesce((select private.has_permission('team', 'edit')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  select * into v_link from platform.professional_tenant_link l
  where l.tenant_id = v_tenant and l.id = p_link_id and l.deleted_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'professional_link_id';
  end if;
  if v_link.professional_id is not null then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'propass';
  end if;
  if num_nonnulls(p_invite_email_hmac, p_invite_email_enc) = 1 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'invite_email';
  end if;
  v_changed := p_invite_email_enc is not null and p_invite_email_enc is distinct from v_link.invite_email_enc;
  if v_changed then
    if exists (select 1 from platform.professional_tenant_link l
               where l.tenant_id = v_tenant and l.invite_email_hmac = p_invite_email_hmac and l.deleted_at is null
                 and l.id <> p_link_id) then
      raise exception using errcode = '23505', message = 'ATTA-IN-0002', detail = 'invite_email';
    end if;
    update platform.professional_tenant_link l
    set invite_email_hmac = p_invite_email_hmac, invite_email_enc = p_invite_email_enc, updated_at = now()
    where l.id = p_link_id;
  end if;
  perform audit.record_event('professional.resend_invite', 'platform.professional_tenant_link', p_link_id,
    jsonb_build_object('email_changed', v_changed),
    case when v_changed then jsonb_build_object('invite_email_enc', encode(v_link.invite_email_enc, 'base64')) end,
    case when v_changed then jsonb_build_object('invite_email_enc', encode(p_invite_email_enc, 'base64')) end);
  perform private.propass_issue(v_tenant, p_link_id, p_propass_secret_hash);
end;
$$;

revoke all on function api.professional_invite(uuid, bytea, bytea, uuid, bytea, smallint, bytea) from public, anon;
revoke all on function api.professional_resend_invite(uuid, bytea, bytea, bytea) from public, anon;
grant execute on function api.professional_invite(uuid, bytea, bytea, uuid, bytea, smallint, bytea) to authenticated;
grant execute on function api.professional_resend_invite(uuid, bytea, bytea, bytea) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Fluxo do profissional (sem login): só o servidor, com o segredo do link (ADR 0004 §1)
-- ---------------------------------------------------------------------------------------------------------------
insert into audit.action (action, kind) values
  ('propass.open', 'access'),
  ('propass.submit', 'change'),
  ('propass.refused', 'change')
on conflict (action) do nothing;

-- Abre o PROpass: devolve o e-mail do convite (cifrado, envelope do vínculo) para a tela mostrar travado, a etapa e
-- invited_at, a emissão deste link (o convite ou o último "Reenviar Link"), para o rodapé "Convite de <data hora>".
-- Não consome o link. Link inexistente, vencido, revogado ou de vínculo excluído: a mesma resposta.
create function api.propass_resolve(p_secret_hash bytea)
returns table (link_id uuid, tenant_id uuid, tenant_name text, step text, invite_email_enc bytea,
               invite_envelope_id uuid, invite_dek_wrapped bytea, invite_kek_version smallint, invited_at timestamptz,
               expires_at timestamptz)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v platform.access_grant;
begin
  select * into v from platform.access_grant g
  where g.secret_hash = p_secret_hash and g.purpose = 'professional_propass';
  if not found or not private.grant_is_valid(v.id, 'professional_propass') then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004', detail = 'grant';
  end if;
  update platform.access_grant g set last_used_at = now() where g.id = v.id;
  perform audit.record_event('propass.open', 'platform.professional_tenant_link', v.professional_link_id, '{}',
                             null, null, v.tenant_id);
  return query
  select l.id, l.tenant_id, t.name,
         case when l.professional_id is null then 'dados' else 'termo' end,
         l.invite_email_enc, l.envelope_id, l.dek_wrapped, l.kek_version, v.created_at, v.expires_at
  from platform.professional_tenant_link l
  join platform.tenant t on t.id = l.tenant_id
  where l.id = v.professional_link_id;
end;
$$;

-- Grava os dados que o próprio profissional preencheu e liga o vínculo, numa transação só.
-- O servidor, antes: normaliza e valida (Zod), confere o registro na porta do conselho (Camada 1), decifra o e-mail do
-- convite e cifra CPF, WhatsApp e e-mail com o envelope do profissional (getCofre('network'), AAD
-- |platform.professional|<coluna>|<p_professional_id>). O banco não cifra nem calcula HMAC (ADR 0002 §6).
create function api.propass_submit(
  p_secret_hash bytea,
  p_professional_id uuid,             -- gerado no servidor (entra na AAD); ignorado se o profissional já existe
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
  p_council_status text,              -- resposta da porta do conselho no envio: 'regularizado' | 'nao_consultado'
  p_privacy_notice_version text       -- versão do Aviso de Privacidade do Profissional que ele confirmou ter lido
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
               p_privacy_notice_version) > 0
     or length(btrim(p_privacy_notice_version)) = 0 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'propass_fields';
  end if;
  if p_email_hmac is distinct from v_link.invite_email_hmac then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'email';
  end if;
  if p_council_status is null or p_council_status not in ('regularizado', 'nao_consultado') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'council';
  end if;

  -- conselho existente só liga com o mesmo CPF e o mesmo e-mail (o do convite); CPF de outro profissional,
  -- profissional excluído ou já ligado a esta clínica também não. A mesma resposta em todos ('recusado'), sem dizer qual (Tech Lead, 20/11): ninguém se apossa
  -- do registro de outro digitando o número do conselho. Para o link não virar oráculo de CPF (o número do conselho é
  -- público), cada recusa conta no link e a 5ª o revoga (Tech Lead, #129). Por isso não há raise aqui: o contador
  -- precisa ficar gravado. O servidor também limita por IP (src/server/limite.ts, propass.submit.ip).
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
    -- o mesmo profissional, já homologado por outra clínica: liga sem mexer nos dados globais dele; a conferência
    -- nova só atualiza o estado do conselho quando houve consulta de verdade
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
            p_cpf_masked, p_cpf_enc, p_phone_enc, p_email_hmac, p_email_enc, p_dek_wrapped, p_kek_version, p_council_status,
            case when p_council_status = 'regularizado' then now() end);
    v_prof := p_professional_id;
  end if;

  update platform.professional_tenant_link l
  set professional_id = v_prof, propass_completed_at = now(), privacy_notice_version = btrim(p_privacy_notice_version),
      privacy_notice_ack_at = now(), updated_at = now()
  where l.id = v_link.id;
  update platform.access_grant g set last_used_at = now() where g.id = v.id;
  perform audit.record_event('propass.submit', 'platform.professional_tenant_link', v_link.id,
    jsonb_build_object('reused_professional', v_reused, 'privacy_notice_version', btrim(p_privacy_notice_version),
                       'council_status', p_council_status),
    null, jsonb_build_object('professional_id', v_prof), v_link.tenant_id);
  return 'ok';
end;
$$;

revoke all on function api.propass_resolve(bytea) from public, anon, authenticated;
revoke all on function api.propass_submit(bytea, uuid, text, text, text, text, bytea, text, bytea, bytea, bytea, bytea,
                                          bytea, smallint, text, text) from public, anon, authenticated;
grant execute on function api.propass_resolve(bytea) to service_role;
grant execute on function api.propass_submit(bytea, uuid, text, text, text, text, bytea, text, bytea, bytea, bytea, bytea,
                                             bytea, smallint, text, text) to service_role;
