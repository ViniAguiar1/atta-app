-- MIG-12: "Algum dado não confere? Reportar à ATTA" no Novo paciente, ANTES do vínculo (PDD §10.1, RN-PAC-08; captura 17;
-- pedido do Frontend 3). A recepção consultou o CPF (api.patient_lookup_by_cpf), viu o cartão da rede com dado que não
-- confere e reporta sem vincular. O api.report_divergence continua para quem já é paciente (pelo person_id).
--   - mesma permissão e mesmo limite do lookup (patients create; 30/h por usuário e 300/dia por clínica, dentro do banco);
--   - motivo só da lista fechada, sem texto livre (dono, 20/11);
--   - não devolve nada da pessoa: a resposta é sempre {status: 'recebido'}, ache ou não o CPF, para o reporte não virar
--     outro oráculo de existência. CPF fora da rede não grava reporte (não há de quem), mas a tentativa vai para a trilha
--     e conta no limite (sem raise, nada se desfaz).

create function api.report_divergence_by_cpf(p_cpf_hmac bytea, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_person uuid;
  v_id uuid;
begin
  if v_tenant is null or not coalesce((select private.has_permission('patients', 'create')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  perform private.patient_cpf_rate_limit(v_tenant);
  if p_cpf_hmac is null or octet_length(p_cpf_hmac) <> 32 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'cpf_hmac';
  end if;
  if p_reason is null or p_reason not in ('nome_nao_confere', 'data_nascimento_nao_confere', 'cpf_nao_e_do_paciente',
                                          'outro') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'reason';
  end if;
  select p.id into v_person from network.person p where p.cpf_hmac = p_cpf_hmac and p.deleted_at is null;
  if v_person is not null then
    insert into network.divergence_report (tenant_id, person_id, reason)
    values (v_tenant, v_person, p_reason) returning id into v_id;
  end if;
  perform audit.record_event('patient.divergence', 'network.person', v_person,
    jsonb_build_object('report_id', v_id, 'by', 'cpf', 'found', v_person is not null));
  return jsonb_build_object('status', 'recebido');
end;
$$;
revoke all on function api.report_divergence_by_cpf(bytea, text) from public, anon;
grant execute on function api.report_divergence_by_cpf(bytea, text) to authenticated;
