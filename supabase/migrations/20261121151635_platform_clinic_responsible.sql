-- MIG-42 (backend, BE1): gestor e Responsável Técnico do Perfil da Clínica (PDD v206 §10.4.1; ADR 0001, §"Perfil da
-- Clínica"). O dado pessoal chega já cifrado pelo servidor do Next (getCofre('network'), envelope por linha, AAD
-- tenant_id|platform.tenant_responsible|<coluna>|<envelope_id>), com o HMAC do CPF e as máscaras; o banco nunca vê o
-- valor puro. Campo a campo, como o resto do Perfil: devolve saved_at e grava tenant.profile_update só com o nome do
-- campo. E o api.clinic_profile ganha lock_on_first_fill (pedido do Frontend, R43).

create or replace function api.clinic_profile() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  t platform.tenant;
  g platform.tenant_responsible;
  r platform.tenant_responsible;
begin
  if v_tenant is null or not coalesce((select private.has_permission('settings', 'view')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  select * into t from platform.tenant where id = v_tenant and deleted_at is null;
  select * into g from platform.tenant_responsible where tenant_id = v_tenant and role = 'manager';
  select * into r from platform.tenant_responsible where tenant_id = v_tenant and role = 'technical_lead';
  perform audit.record_event('tenant.profile_read', 'platform.tenant', v_tenant, '{}');
  return jsonb_build_object(
    'created_at', t.created_at,
    'timezone', t.timezone,
    'saved_at', t.profile_saved_at,
    'fields', jsonb_build_object(
      'trade_name', t.name, 'legal_name', t.legal_name, 'cnpj', t.cnpj, 'tax_registration', t.tax_registration,
      'main_specialty', t.main_specialty, 'address_cep', t.address_cep, 'address_street', t.address_street,
      'address_number', t.address_number, 'address_complement', t.address_complement, 'address_city', t.address_city,
      'address_uf', t.address_uf, 'phone', t.phone, 'clinic_whatsapp', t.clinic_whatsapp,
      'commercial_email', t.commercial_email),
    -- os campos que travam depois do 1º preenchimento (§10.4.3): a tela pede confirmação antes de gravá-los (R43)
    'lock_on_first_fill', to_jsonb(array['legal_name', 'cnpj']),
    'protected_fields', to_jsonb(array_remove(array[
      case when t.legal_name is not null then 'legal_name' end,
      case when t.cnpj is not null then 'cnpj' end], null)),
    'manager', case when g.id is null then null else jsonb_build_object(
      'full_name', g.full_name, 'cpf_masked', g.cpf_masked, 'email_masked', g.email_masked, 'whatsapp_masked', g.phone_masked) end,
    'technical_lead', case when r.id is null then null else jsonb_build_object(
      'same_as_manager', r.same_as_manager,
      'full_name', case when r.same_as_manager then g.full_name else r.full_name end,
      'cpf_masked', case when r.same_as_manager then g.cpf_masked else r.cpf_masked end,
      'council', r.council, 'council_uf', r.council_uf, 'council_number', r.council_number) end,
    'missing_required', to_jsonb(private.clinic_profile_missing(v_tenant)));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- O envelope da linha, para o servidor abrir a DEK e cifrar o próximo campo com a mesma chave. Só settings.edit.
-- Sem linha ainda: nada (o servidor gera um envelope novo e manda no primeiro campo).
-- ---------------------------------------------------------------------------------------------------------------
create function api.clinic_responsible_envelope(p_role text)
returns table (envelope_id uuid, dek_wrapped bytea, kek_version smallint)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
begin
  if v_tenant is null or not coalesce((select private.has_permission('settings', 'edit')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if p_role is null or p_role not in ('manager', 'technical_lead') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'role';
  end if;
  return query select r.envelope_id, r.dek_wrapped, r.kek_version from platform.tenant_responsible r
    where r.tenant_id = v_tenant and r.role = p_role;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Um campo do gestor ou do RT (settings.edit). Lista fechada por papel:
--   os dois: full_name (p_text) e cpf (p_hmac, p_masked e p_enc);
--   gestor:  email e whatsapp (p_masked e p_enc);
--   RT:      same_as_manager (p_bool; marcado, apaga o nome e o CPF próprios), council, council_uf, council_number.
-- Tudo nulo apaga o campo. A primeira escrita de um papel traz o envelope (p_envelope_id, p_dek_wrapped, p_kek_version);
-- depois, o envelope não muda (outro envelope é recusado, para nenhum campo ficar com uma chave diferente da linha).
-- ---------------------------------------------------------------------------------------------------------------
create function api.clinic_responsible_set(
  p_role text,
  p_field text,
  p_text text default null,
  p_hmac bytea default null,
  p_masked text default null,
  p_enc bytea default null,
  p_bool boolean default null,
  p_envelope_id uuid default null,
  p_dek_wrapped bytea default null,
  p_kek_version smallint default null
) returns timestamptz
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_now timestamptz := now();
  v_text text := nullif(btrim(p_text), '');
  r platform.tenant_responsible;
begin
  if v_tenant is null or not coalesce((select private.has_permission('settings', 'edit')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if p_role is null or p_role not in ('manager', 'technical_lead') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'role';
  end if;
  if p_field is null or not (p_field in ('full_name', 'cpf')
       or (p_role = 'manager' and p_field in ('email', 'whatsapp'))
       or (p_role = 'technical_lead' and p_field in ('same_as_manager', 'council', 'council_uf', 'council_number'))) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'field';
  end if;
  -- cifrado e máscara andam juntos (e, no CPF, o HMAC): ou os três, ou nenhum. As máscaras têm o formato que o servidor
  -- gera, com o ponto médio (ADR 0002 §6), para nenhum valor em claro cair na coluna da máscara (Segurança e BE5, #325):
  --   CPF ···.···.938-60 · e-mail g···@dominio · WhatsApp (11) ·····-0099
  -- O cifrado é um contêiner do formato 1 (0x01, versão, nonce, dado, tag): pelo menos 32 bytes, começando em 0x01.
  if (p_field = 'cpf' and num_nulls(p_hmac, p_masked, p_enc) not in (0, 3))
     or (p_field in ('email', 'whatsapp') and num_nulls(p_masked, p_enc) not in (0, 2))
     or (p_field = 'cpf' and p_hmac is not null and octet_length(p_hmac) <> 32)
     or (p_enc is not null and (octet_length(p_enc) < 32 or get_byte(p_enc, 0) <> 1))
     or (p_field = 'cpf' and p_masked is not null and p_masked !~ '^···\.···\.[0-9]{3}-[0-9]{2}$')
     or (p_field = 'email' and p_masked is not null
         and (char_length(p_masked) > 254 or p_masked !~ '^[^@·[:space:]]···@[^@[:space:]]+\.[^@[:space:]]+$'))
     or (p_field = 'whatsapp' and p_masked is not null and p_masked !~ '^\([1-9][0-9]\) ·····-[0-9]{4}$')
     or (p_field = 'same_as_manager' and p_bool is null) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = p_field;
  end if;

  select * into r from platform.tenant_responsible where tenant_id = v_tenant and role = p_role for update;
  if r.id is null then
    if num_nulls(p_envelope_id, p_dek_wrapped, p_kek_version) > 0 then
      raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'envelope';
    end if;
    begin
      insert into platform.tenant_responsible (tenant_id, role, envelope_id, dek_wrapped, kek_version)
      values (v_tenant, p_role, p_envelope_id, p_dek_wrapped, p_kek_version)
      returning * into r;
    exception when unique_violation then
      -- outra escrita criou a linha entre o select e o insert (1ª escrita concorrente, BE5 no #325): relê e segue,
      -- e o envelope precisa ser o dela
      select * into r from platform.tenant_responsible where tenant_id = v_tenant and role = p_role for update;
      if p_envelope_id is distinct from r.envelope_id then
        raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'envelope';
      end if;
    end;
  elsif p_envelope_id is not null and p_envelope_id is distinct from r.envelope_id then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'envelope';
  end if;
  if p_field = 'council_uf' and v_text is not null and upper(v_text) not in ('AC','AL','AP','AM','BA','CE','DF','ES','GO',
       'MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = p_field;
  end if;
  -- RT "mesma pessoa que o gestor": o nome e o CPF são os do gestor; não se grava outro por cima
  if r.same_as_manager and p_field in ('full_name', 'cpf') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'same_as_manager';
  end if;

  begin
    update platform.tenant_responsible set
      full_name = case when p_field = 'full_name' then v_text
                       when p_field = 'same_as_manager' and p_bool then null else full_name end,
      cpf_hmac = case when p_field = 'cpf' then p_hmac when p_field = 'same_as_manager' and p_bool then null else cpf_hmac end,
      cpf_masked = case when p_field = 'cpf' then p_masked when p_field = 'same_as_manager' and p_bool then null else cpf_masked end,
      cpf_enc = case when p_field = 'cpf' then p_enc when p_field = 'same_as_manager' and p_bool then null else cpf_enc end,
      email_masked = case when p_field = 'email' then p_masked else email_masked end,
      email_enc = case when p_field = 'email' then p_enc else email_enc end,
      phone_masked = case when p_field = 'whatsapp' then p_masked else phone_masked end,
      phone_enc = case when p_field = 'whatsapp' then p_enc else phone_enc end,
      same_as_manager = case when p_field = 'same_as_manager' then p_bool else same_as_manager end,
      council = case when p_field = 'council' then lower(v_text) else council end,
      council_uf = case when p_field = 'council_uf' then upper(v_text) else council_uf end,
      council_number = case when p_field = 'council_number' then v_text else council_number end
    where id = r.id;
  exception when check_violation then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = p_field;
  end;

  update platform.tenant set profile_saved_at = v_now where id = v_tenant;
  perform audit.record_event('tenant.profile_update', 'platform.tenant', v_tenant,
    jsonb_build_object('field', p_role || '.' || p_field));
  return v_now;
end;
$$;

revoke all on function api.clinic_responsible_envelope(text), api.clinic_responsible_set(text, text, text, bytea, text,
  bytea, boolean, uuid, bytea, smallint) from public, anon;
grant execute on function api.clinic_responsible_envelope(text), api.clinic_responsible_set(text, text, text, bytea, text,
  bytea, boolean, uuid, bytea, smallint) to authenticated;
