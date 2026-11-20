-- MIG-13a: grant de sessão do paciente (e do link do profissional), ADR 0004 §3.
--
-- PDD v206 §11.4 (check-in com código) e §10.2.3 / §13.4 (Boarding Check por link e PIN, sem login). O paciente e o
-- profissional não têm usuário no Auth: com o código confirmado (MIG-13b) ou o PIN certo (Backend 3), o servidor emite
-- um grant e guarda o segredo (32 bytes aleatórios) só no cookie atta_grant; o banco guarda só o sha256. Cada server
-- action resolve o grant e age só dentro do tenant, da pessoa ou do profissional e do atendimento do grant, que nunca
-- vêm do navegador.
--
-- Regra num lugar só (ADR 0004 §3): a validade e a revogação de todo grant ficam em private.grant_policy e
-- private.grant_is_valid (e nas constantes de src/server/grant/politica.ts, que espelham estas):
--   - patient_checkin: 30 min sem uso, renovada a cada ação, com teto de 2 h (ADR 0004 §3);
--   - professional_boarding: 8 h a partir do envio do link pelo WhatsApp (PDD RN-FIC-07, §10.2.3 e §13.4: "8 (oito)
--     horas a partir do envio via WhatsApp (decisão da PO)"), ou a conclusão, ou o cancelamento, o que vier primeiro.
--     O teto conta de sent_at, que a fila de mensagens preenche quando confirma o envio (api.grant_mark_sent); até lá,
--     o grant do profissional não vale. A revogação na conclusão e no cancelamento entra na transição de estado do
--     atendimento (MIG-11/13). O PIN (5 erros seguidos bloqueiam 15 min; 10 no total revogam) entra no MIG-23
--     (Backend 3), nesta mesma função.
-- O appointment_id ainda não tem FK: atta_in.appointment chega no MIG-11 e a FK entra lá. O professional_id ganha a
-- FK para platform.professional no MIG-14a.

create table platform.access_grant (
  id uuid primary key default gen_random_uuid(),
  purpose text not null,
  tenant_id uuid not null references platform.tenant (id),
  person_id uuid references network.person (id),
  professional_id uuid,
  appointment_id uuid not null,
  secret_hash bytea not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,          -- teto absoluto: emissão + teto (paciente) ou envio + teto (profissional)
  sent_at timestamptz,                      -- profissional: quando a fila confirmou o envio do link
  last_used_at timestamptz,
  revoked_at timestamptz,
  constraint access_grant_purpose_check check (purpose in ('patient_checkin', 'professional_boarding')),
  constraint access_grant_subject_check check (
    (purpose = 'patient_checkin' and person_id is not null and professional_id is null)
    or (purpose = 'professional_boarding' and professional_id is not null and person_id is null)),
  constraint access_grant_secret_hash_size_check check (octet_length(secret_hash) = 32),
  constraint access_grant_secret_hash_uq unique (secret_hash)
);
create index access_grant_appointment_idx on platform.access_grant (tenant_id, appointment_id);

-- fechada: nenhum grant e nenhuma policy para anon e authenticated; só as funções abaixo, pelo service_role
alter table platform.access_grant enable row level security;
alter table platform.access_grant force row level security;
revoke all on platform.access_grant from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Política (o único lugar dos números) e validade
-- ---------------------------------------------------------------------------------------------------------------
create function private.grant_policy(p_purpose text, out idle interval, out ceiling interval)
language sql immutable set search_path = ''
as $$
  select case p_purpose when 'patient_checkin' then interval '30 minutes' end,
         case p_purpose when 'patient_checkin' then interval '2 hours'
                        when 'professional_boarding' then interval '8 hours' end
$$;

create function private.grant_is_valid(p_grant_id uuid, p_purpose text) returns boolean
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
     or (v.purpose = 'patient_checkin' and now() >= v.created_at + v_policy.ceiling) then
    return false;
  end if;
  if v_policy.idle is not null and now() >= coalesce(v.last_used_at, v.created_at) + v_policy.idle then
    return false;
  end if;
  -- profissional: só depois do envio do link, e até 8 h dele (RN-FIC-07)
  if v.purpose = 'professional_boarding' and (v.sent_at is null or now() >= v.sent_at + v_policy.ceiling) then
    return false;
  end if;
  return true;
end;
$$;

revoke all on function private.grant_policy(text) from public, anon, authenticated;
revoke all on function private.grant_is_valid(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- api: emitir, resolver (renova o uso) e revogar. EXECUTE só para service_role (o servidor, com o cliente admin)
-- ---------------------------------------------------------------------------------------------------------------
insert into audit.action (action, kind) values
  ('grant.issue', 'change'),
  ('grant.sent', 'change'),
  ('grant.revoke', 'change')
on conflict (action) do nothing;

-- Quem chama é o servidor, depois de conferir o código (MIG-13b) ou o PIN: os ids vêm do desafio ou do atendimento,
-- nunca do navegador.
create function api.grant_issue(
  p_purpose text,
  p_secret_hash bytea,
  p_tenant_id uuid,
  p_appointment_id uuid,
  p_person_id uuid default null,
  p_professional_id uuid default null
) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_ceiling interval := (select ceiling from private.grant_policy(p_purpose));
  v_id uuid;
begin
  if v_ceiling is null then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'purpose';
  end if;
  if p_secret_hash is null or octet_length(p_secret_hash) <> 32 or p_tenant_id is null or p_appointment_id is null then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'grant';
  end if;
  insert into platform.access_grant (purpose, tenant_id, person_id, professional_id, appointment_id, secret_hash,
                                     expires_at)
  values (p_purpose, p_tenant_id, p_person_id, p_professional_id, p_appointment_id, p_secret_hash, now() + v_ceiling)
  returning id into v_id;
  perform audit.record_event('grant.issue', 'platform.access_grant', v_id,
    jsonb_build_object('purpose', p_purpose, 'appointment_id', p_appointment_id), null, null, p_tenant_id);
  return v_id;
end;
$$;

-- Resolve o segredo do cookie: devolve o contexto só se o grant é válido para a finalidade pedida, e renova o uso.
-- Grant inexistente, vencido, revogado ou de outra finalidade: a mesma resposta (sem dizer qual).
create function api.grant_resolve(p_secret_hash bytea, p_purpose text)
returns table (grant_id uuid, tenant_id uuid, person_id uuid, professional_id uuid, appointment_id uuid,
               expires_at timestamptz)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v platform.access_grant;
begin
  select * into v from platform.access_grant g where g.secret_hash = p_secret_hash;
  if not found or not private.grant_is_valid(v.id, p_purpose) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004', detail = 'grant';
  end if;
  update platform.access_grant g set last_used_at = now() where g.id = v.id;
  return query select v.id, v.tenant_id, v.person_id, v.professional_id, v.appointment_id, v.expires_at;
end;
$$;

-- A fila de mensagens confirma o envio do link do profissional: o grant passa a valer, por 8 h a partir daqui. Só uma
-- vez, e só para o link do profissional.
create function api.grant_mark_sent(p_grant_id uuid) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v platform.access_grant;
begin
  update platform.access_grant g
  set sent_at = now(), expires_at = now() + (select ceiling from private.grant_policy(g.purpose))
  where g.id = p_grant_id and g.purpose = 'professional_boarding' and g.sent_at is null and g.revoked_at is null
  returning * into v;
  if not found then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'grant';
  end if;
  perform audit.record_event('grant.sent', 'platform.access_grant', v.id, '{}', null, null, v.tenant_id);
end;
$$;

-- Revoga (sair, PIN errado demais, atendimento encerrado). Idempotente; grant desconhecido não dá erro (sem oráculo).
create function api.grant_revoke(p_secret_hash bytea) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v platform.access_grant;
begin
  update platform.access_grant g set revoked_at = now()
  where g.secret_hash = p_secret_hash and g.revoked_at is null
  returning * into v;
  if found then
    perform audit.record_event('grant.revoke', 'platform.access_grant', v.id,
      jsonb_build_object('purpose', v.purpose), null, null, v.tenant_id);
  end if;
end;
$$;

revoke all on function api.grant_issue(text, bytea, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function api.grant_resolve(bytea, text) from public, anon, authenticated;
revoke all on function api.grant_revoke(bytea) from public, anon, authenticated;
revoke all on function api.grant_mark_sent(uuid) from public, anon, authenticated;
grant execute on function api.grant_issue(text, bytea, uuid, uuid, uuid, uuid) to service_role;
grant execute on function api.grant_resolve(bytea, text) to service_role;
grant execute on function api.grant_revoke(bytea) to service_role;
grant execute on function api.grant_mark_sent(uuid) to service_role;
