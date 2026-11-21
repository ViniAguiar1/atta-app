-- MIG-14b: o api.propass_resolve passa a devolver também o fuso da clínica (platform.tenant.timezone), para a tela do
-- PROpass mostrar a data do convite no fuso dela (pedido do Frontend 6, porta real no #263; antes ia o padrão fixo
-- America/Sao_Paulo). Só uma coluna nova no fim; o corpo é o mesmo do 20261120211920. Mudar o tipo de retorno pede
-- drop + create, e os grants voltam iguais (só service_role).
drop function api.propass_resolve(bytea);

create function api.propass_resolve(p_secret_hash bytea)
returns table (link_id uuid, tenant_id uuid, tenant_name text, step text, invite_email_enc bytea,
               invite_envelope_id uuid, invite_dek_wrapped bytea, invite_kek_version smallint, invited_at timestamptz,
               expires_at timestamptz, tenant_timezone text)
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
         l.invite_email_enc, l.envelope_id, l.dek_wrapped, l.kek_version, v.created_at, v.expires_at, t.timezone
  from platform.professional_tenant_link l
  join platform.tenant t on t.id = l.tenant_id
  where l.id = v.professional_link_id;
end;
$$;
revoke all on function api.propass_resolve(bytea) from public, anon, authenticated;
grant execute on function api.propass_resolve(bytea) to service_role;
