-- MIG-12: contagem de pacientes ativos da clínica, para o Módulo ATTA › Privacidade & Dados (PDD v206 §10.6.3; pedido do
-- Frontend 5, sugestão da Security Engineer no #153). Hoje a tela chama api.patient_list(p_limit => 1) só para ler o
-- total_active: traz uma linha de paciente sem precisar e grava patient.list na trilha a cada abertura.
-- api.patient_count() devolve só o número, o mesmo total_active da lista (vínculos ativos desta clínica, sem os
-- arquivados), com a mesma permissão (patients view). Um número agregado não é leitura de dado pessoal: não grava trilha.

create function api.patient_count() returns integer
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
begin
  if v_tenant is null or not coalesce((select private.has_permission('patients', 'view')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  return (select count(*)::int
          from network.person_tenant_link l
          join network.person p on p.id = l.person_id
          where l.tenant_id = v_tenant and l.archived_at is null and p.deleted_at is null);
end;
$$;
revoke all on function api.patient_count() from public, anon;
grant execute on function api.patient_count() to authenticated;
