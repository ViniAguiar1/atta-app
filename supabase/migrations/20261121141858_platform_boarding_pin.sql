-- MIG-23 (parte 1): PIN do Boarding Check no servidor real. PDD v206 RN-FIC-07, §10.2.3 e §13.4; PLANO "Validade do
-- link e do PIN do Boarding Check"; ADR 0004 §3 (travas 1, 2 e 4). Só service_role; nenhum id vem do navegador.
--
-- O link do WhatsApp (/b/<segredo>) é um access_grant professional_boarding. O GET não consome; só o PIN certo consome,
-- e na mesma transação o grant passa a ter o hash da sessão (cookie atta_grant) no lugar do hash do link, que deixa de
-- valer. session_started_at separa os dois momentos: as funções do link só aceitam grant sem sessão, e as da sessão
-- (parte 2: abrir e concluir) só com sessão.
--
-- O banco nunca vê o PIN: o servidor pede o profissional do link (api.boarding_pin_subject), calcula
-- pin_mac = HMAC(ATTA_PIN_PEPPER, 'atta.pin.v1|' || professional_id || '|' || pin) (src/server/pin) e manda só o mac.
--
-- Limites (PLANO; o PDD é omisso, valem os do simulador): 5 erros seguidos bloqueiam por 15 minutos; 10 no total revogam
-- o link (a recepção reenvia um novo, que nasce zerado). Os erros voltam como RESULTADO, sem raise, para o contador
-- ficar gravado (o mesmo padrão do PROpass, #247). Por isso o bloqueio é o status 'bloqueado' com a hora, e não o
-- SQLSTATE 54000: um raise desfaria o próprio bloqueio, e a tela precisa da hora (contrato da porta, MIG-53).
-- Link desconhecido, vencido, revogado, concluído ou cancelado: 'indisponivel', a mesma resposta (sem oráculo).
-- Cada conferência de um link que existe vai para a trilha (boarding.pin_ok, boarding.pin_fail); o PIN nunca.
-- Sempre para a frente.

alter table platform.access_grant
  add column pin_failures_streak smallint not null default 0,
  add column pin_failures_total smallint not null default 0,
  add column pin_locked_until timestamptz,
  add column session_started_at timestamptz,
  add constraint access_grant_pin_failures_check
    check (pin_failures_streak between 0 and 4 and pin_failures_total between 0 and 10),
  -- tentativas de PIN e sessão só existem no Boarding Check
  add constraint access_grant_pin_purpose_check
    check (purpose = 'professional_boarding'
           or (pin_failures_streak = 0 and pin_failures_total = 0 and pin_locked_until is null
               and session_started_at is null));

insert into audit.action (action, kind) values
  ('boarding.pin_ok', 'change'),
  ('boarding.pin_fail', 'change')
on conflict (action) do nothing;

-- O profissional do link, para o servidor calcular o pin_mac. Só de link válido e ainda sem sessão; senão, nenhuma
-- linha (o servidor responde 'indisponivel'). Não conta tentativa nem audita: ainda não houve PIN.
create function api.boarding_pin_subject(p_link_hash bytea)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.professional_id
  from platform.access_grant g
  join platform.professional_tenant_link l on l.tenant_id = g.tenant_id and l.id = g.professional_link_id
  where p_link_hash is not null and octet_length(p_link_hash) = 32
    and g.secret_hash = p_link_hash and g.purpose = 'professional_boarding' and g.session_started_at is null
    and private.grant_is_valid(g.id, 'professional_boarding')
$$;
revoke all on function api.boarding_pin_subject(bytea) from public, anon, authenticated;
grant execute on function api.boarding_pin_subject(bytea) to service_role;

create function api.boarding_confirm_pin(p_link_hash bytea, p_pin_mac bytea, p_session_hash bytea)
returns table (status text, locked_until text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v platform.access_grant;
  v_professional uuid;
  v_certo boolean;
begin
  if p_pin_mac is null or octet_length(p_pin_mac) <> 32 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'pin';
  end if;
  if p_session_hash is null or octet_length(p_session_hash) <> 32 or p_session_hash = p_link_hash then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'session';
  end if;

  -- a linha do grant fica presa: duas tentativas ao mesmo tempo não contam uma vez só nem passam do limite
  select * into v from platform.access_grant g
  where p_link_hash is not null and g.secret_hash = p_link_hash and g.purpose = 'professional_boarding'
    and g.session_started_at is null
  for update;
  if not found or not private.grant_is_valid(v.id, 'professional_boarding') then
    return query select 'indisponivel'::text, null::text;
    return;
  end if;
  select l.professional_id into v_professional
  from platform.professional_tenant_link l where l.tenant_id = v.tenant_id and l.id = v.professional_link_id;

  -- bloqueado: nem confere o PIN (o certo também espera); não conta, mas fica na trilha
  if v.pin_locked_until is not null and now() < v.pin_locked_until then
    perform audit.record_event('boarding.pin_fail', 'platform.access_grant', v.id,
      jsonb_build_object('reason', 'locked'), null, null, v.tenant_id);
    return query select 'bloqueado'::text,
                        pg_catalog.to_char(v.pin_locked_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    return;
  end if;

  -- o PIN do profissional, na versão do pepper atual (1). Sem PIN (o reaproveitado que ainda não criou o dele,
  -- PLANO "PROpass: pendências") conta como erro: a mesma resposta, sem dizer por quê
  v_certo := exists (select 1 from platform.professional_pin pp
                     where pp.professional_id = v_professional and pp.pin_mac_version = 1 and pp.pin_mac = p_pin_mac);

  if v_certo then
    update platform.access_grant g
    set secret_hash = p_session_hash, session_started_at = now(), last_used_at = now(),
        pin_failures_streak = 0, pin_locked_until = null
    where g.id = v.id;
    perform audit.record_event('boarding.pin_ok', 'platform.access_grant', v.id,
      jsonb_build_object('appointment_id', v.appointment_id), null, null, v.tenant_id);
    return query select 'ok'::text, null::text;
    return;
  end if;

  -- erro: o 10º no total revoga; o 5º seguido bloqueia por 15 minutos e zera a sequência
  update platform.access_grant g
  set pin_failures_total = g.pin_failures_total + 1,
      pin_failures_streak = case when g.pin_failures_total + 1 >= 10 or g.pin_failures_streak + 1 >= 5 then 0
                                 else g.pin_failures_streak + 1 end,
      pin_locked_until = case when g.pin_failures_total + 1 < 10 and g.pin_failures_streak + 1 >= 5
                              then now() + interval '15 minutes' else g.pin_locked_until end,
      revoked_at = case when g.pin_failures_total + 1 >= 10 then now() else g.revoked_at end,
      last_used_at = now()
  where g.id = v.id
  returning g.* into v;
  perform audit.record_event('boarding.pin_fail', 'platform.access_grant', v.id,
    jsonb_build_object('reason', 'wrong_pin', 'attempt', v.pin_failures_total), null, null, v.tenant_id);

  if v.revoked_at is not null then
    perform audit.record_event('grant.revoke', 'platform.access_grant', v.id,
      jsonb_build_object('purpose', 'professional_boarding', 'reason', 'pin_attempts'), null, null, v.tenant_id);
    return query select 'indisponivel'::text, null::text;
    return;
  end if;
  if v.pin_locked_until is not null and now() < v.pin_locked_until then
    return query select 'bloqueado'::text,
                        pg_catalog.to_char(v.pin_locked_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    return;
  end if;
  return query select 'pin_incorreto'::text, null::text;
end;
$$;
revoke all on function api.boarding_confirm_pin(bytea, bytea, bytea) from public, anon, authenticated;
grant execute on function api.boarding_confirm_pin(bytea, bytea, bytea) to service_role;
