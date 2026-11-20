-- MIG-13a (parte 2): o grant do profissional aponta para o vínculo com a clínica (ADR 0005 §1; revisão do Tech Lead no
-- #30), com FK composta para o vínculo da mesma clínica. O profissional global só existe depois do PROpass, e o link do
-- Boarding Check e o do PROpass (MIG-14b, Backend 4) são por vínculo. FK também cobrada pelo QA 2 no #30.
-- A FK do appointment_id entra no MIG-11b, junto com atta_in.appointment.

alter table platform.access_grant rename column professional_id to professional_link_id;
alter table platform.access_grant
  drop constraint access_grant_subject_check,
  add constraint access_grant_subject_check check (
    (purpose = 'patient_checkin' and person_id is not null and professional_link_id is null)
    or (purpose = 'professional_boarding' and professional_link_id is not null and person_id is null)),
  add constraint access_grant_professional_link_fk foreign key (tenant_id, professional_link_id)
    references platform.professional_tenant_link (tenant_id, id);

drop function api.grant_issue(text, bytea, uuid, uuid, uuid, uuid);
drop function api.grant_resolve(bytea, text);

create function api.grant_issue(
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
  if v_ceiling is null then
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

create function api.grant_resolve(p_secret_hash bytea, p_purpose text)
returns table (grant_id uuid, tenant_id uuid, person_id uuid, professional_link_id uuid, appointment_id uuid,
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
  return query select v.id, v.tenant_id, v.person_id, v.professional_link_id, v.appointment_id, v.expires_at;
end;
$$;

revoke all on function api.grant_issue(text, bytea, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function api.grant_resolve(bytea, text) from public, anon, authenticated;
grant execute on function api.grant_issue(text, bytea, uuid, uuid, uuid, uuid) to service_role;
grant execute on function api.grant_resolve(bytea, text) to service_role;
