-- MIG-13 (S2 da Segurança na revisão do #304; divisão do CTO, item 2): trocar o profissional de um agendamento revoga, na
-- mesma transação, os links vivos daquele atendimento que não são do profissional novo (professional_boarding de outro
-- vínculo: o do anterior e qualquer outro que tenha sobrado). Só o profissional atual mantém o link. Sem isso, o Boarding Check do profissional que saiu continuaria abrindo o atendimento.
--   - Gatilho depois do update do professional_link_id (a troca só existe em Agendado, pelo appointment_validate). Vale
--     por qualquer caminho de escrita.
--   - Cada link revogado vai para a trilha grant.revoke, com o motivo professional_change, como os outros motivos do
--     grant (ADR 0004 §3).
--   - O grant de check-in do paciente (patient_checkin) fica: ele não é do profissional, e revogá-lo só obrigaria o
--     paciente a se identificar de novo no meio do preenchimento.
-- O boarding_session (Backend 6, #304) confere também o profissional atual; esta revogação é a segunda barreira.

create function atta_in.appointment_revoke_grants_on_professional_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  if new.professional_link_id is not distinct from old.professional_link_id then
    return null;
  end if;
  for r in
    update platform.access_grant g set revoked_at = now()
    where g.tenant_id = new.tenant_id and g.appointment_id = new.id and g.revoked_at is null
      and g.purpose = 'professional_boarding'
      -- só o profissional atual mantém o link (Backend 4 e Segurança, revisão do #315): o do anterior e qualquer outro
      and g.professional_link_id is distinct from new.professional_link_id
    returning g.id
  loop
    perform audit.record_event('grant.revoke', 'platform.access_grant', r.id,
      jsonb_build_object('purpose', 'professional_boarding', 'reason', 'professional_change', 'appointment_id', new.id),
      null, null, new.tenant_id);
  end loop;
  return null;
end;
$$;
revoke all on function atta_in.appointment_revoke_grants_on_professional_change() from public, anon, authenticated, service_role;
create trigger appointment_revoke_grants_on_professional_change after update of professional_link_id on atta_in.appointment
  for each row execute function atta_in.appointment_revoke_grants_on_professional_change();
