-- MIG-12d (parte 1): CPF já na rede no Novo paciente (PDD v206 §10.1; decisão do dono de 20/11, ADR 0001 §1 revista
-- pelo Tech Lead). A recepção digita o CPF; o servidor calcula o HMAC e:
--   1. api.patient_lookup_by_cpf: diz se o CPF é novo (nao_encontrado), se já é paciente desta clínica (ja_paciente) ou
--      se existe na rede (na_rede). Na rede, devolve o cartão já preenchido (nome, nome social, nascimento, documento
--      mascarado, contato cifrado com o envelope_id, selo de verificação) e só a CONTAGEM de Formulários de Saúde, nunca
--      o conteúdo. Leitura de dado de outra clínica: vai para a auditoria (patient.lookup, access).
--   2. api.patient_link_by_cpf: a recepção confirma e a pessoa é vinculada com network_access = 'granted', sem redigitar
--      nada e sem receber id do navegador (o vínculo é pelo mesmo HMAC).
-- Limite de tentativas (Segurança, S3-7): a consulta por CPF é um oráculo de existência, e o schema api é exposto ao
-- navegador, então o limite vale DENTRO das funções, não só na server action: 30 por hora por usuário e 300 por dia por
-- clínica, no limitador único (api.rate_limit_hit, ADR 0004 §2). A chave aqui é sha256 do id (uuid) do usuário ou da
-- clínica: não é dado pessoal nem se reverte por força bruta como um IP, por isso o banco não precisa do pepper (que ele
-- não tem). Passou do limite: SQLSTATE 54000 (o servidor devolve LIMITE).
-- O patient_register com CPF existente passar a 'granted' e o resto do MIG-12d (S4-2, S3-8) vêm no próximo PR.

insert into audit.action (action, kind) values
  ('patient.lookup', 'access'),
  ('patient.link', 'change')
on conflict (action) do nothing;

-- conta a tentativa nos dois baldes; o primeiro que passar recusa
create function private.patient_cpf_rate_limit(p_tenant uuid) returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not api.rate_limit_hit('patient.cpf.user',
                            extensions.digest('atta.ratelimit.v1|patient.cpf.user|' || (select auth.uid())::text, 'sha256'),
                            30, 3600)
     or not api.rate_limit_hit('patient.cpf.tenant',
                               extensions.digest('atta.ratelimit.v1|patient.cpf.tenant|' || p_tenant::text, 'sha256'),
                               300, 86400) then
    raise exception using errcode = '54000', message = 'ATTA-IN-0003', detail = 'rate_limit';
  end if;
end;
$$;
revoke all on function private.patient_cpf_rate_limit(uuid) from public, anon, authenticated, service_role;

create function api.patient_lookup_by_cpf(p_cpf_hmac bytea) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_person network.person;
  v_status text;
  v_card jsonb;
  v_verified_until timestamptz;
begin
  if v_tenant is null or not coalesce((select private.has_permission('patients', 'create')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  perform private.patient_cpf_rate_limit(v_tenant);
  if p_cpf_hmac is null or octet_length(p_cpf_hmac) <> 32 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'cpf_hmac';
  end if;

  select p.* into v_person from network.person p where p.cpf_hmac = p_cpf_hmac and p.deleted_at is null;
  if v_person.id is null then
    v_status := 'nao_encontrado';
  elsif exists (select 1 from network.person_tenant_link l where l.tenant_id = v_tenant and l.person_id = v_person.id) then
    -- já é paciente daqui: a tela leva à Pasta; o que ela mostra sai do patient_get, com a regra de cada acesso
    v_status := 'ja_paciente';
  else
    v_status := 'na_rede';
    select iv.expires_at into v_verified_until from network.identity_verification iv
    where iv.person_id = v_person.id and iv.result = 'aprovada' and iv.expires_at > now()
    order by iv.expires_at desc limit 1;
    v_card := jsonb_build_object(
      'person_id', v_person.id,
      'full_name', v_person.full_name,
      'social_name', v_person.social_name,
      'birth_date', v_person.birth_date,
      'cpf_masked', v_person.cpf_masked,
      'is_incomplete', v_person.is_incomplete,
      'is_verified', v_verified_until is not null,
      'verified_until', v_verified_until,
      -- contato cifrado: a DEK abre com ('', network.person, 'dek', envelope_id) e cada valor com a AAD da própria
      -- coluna (ADR 0002 §6); bytea em hex, como o PostgREST devolve nas outras funções
      'phone_enc', v_person.phone_enc,
      'email_enc', v_person.email_enc,
      'envelope_id', v_person.id,
      'dek_wrapped', v_person.dek_wrapped,
      'kek_version', v_person.kek_version,
      -- só a contagem, nunca o conteúdo (Gestor e Colaborador nunca leem o Formulário de Saúde). O schema health ainda
      -- não tem a tabela do formulário (MIG-30, Backend 3): fica 0 até ela existir, já no contrato
      'health_forms_count', 0);
  end if;

  perform audit.record_event('patient.lookup', 'network.person', v_person.id, jsonb_build_object('status', v_status));
  return jsonb_build_object('status', v_status,
                            'person_id', case when v_status = 'ja_paciente' then v_person.id end,
                            'card', v_card);
end;
$$;

create function api.patient_link_by_cpf(p_cpf_hmac bytea) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_person uuid;
begin
  if v_tenant is null or not coalesce((select private.has_permission('patients', 'create')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  perform private.patient_cpf_rate_limit(v_tenant);
  if p_cpf_hmac is null or octet_length(p_cpf_hmac) <> 32 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'cpf_hmac';
  end if;
  select p.id into v_person from network.person p where p.cpf_hmac = p_cpf_hmac and p.deleted_at is null;
  if v_person is null then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'cpf';
  end if;
  if exists (select 1 from network.person_tenant_link l where l.tenant_id = v_tenant and l.person_id = v_person) then
    raise exception using errcode = '23505', message = 'ATTA-IN-0002', detail = 'cpf';   -- já cadastrado aqui
  end if;
  -- confirmar o cadastro existente é a autorização de acesso (PDD §10.1): granted, sem campos locais
  insert into network.person_tenant_link (tenant_id, person_id, origin, network_access)
  values (v_tenant, v_person, 'recepcao', 'granted');
  perform audit.record_event('patient.link', 'network.person', v_person, jsonb_build_object('network_access', 'granted'));
  return jsonb_build_object('person_id', v_person, 'network_access', 'granted');
end;
$$;

revoke all on function api.patient_lookup_by_cpf(bytea) from public, anon;
revoke all on function api.patient_link_by_cpf(bytea) from public, anon;
grant execute on function api.patient_lookup_by_cpf(bytea) to authenticated;
grant execute on function api.patient_link_by_cpf(bytea) to authenticated;
