-- MIG-42 (backend, BE1): Perfil da Clínica (PDD v206 §10.4.1; ADR 0001, §"Perfil da Clínica", contrato do Tech Lead de
-- 21/11). Esta parte: os dados da empresa e de contato em platform.tenant, a tabela dos responsáveis (gestor e RT,
-- dado pessoal cifrado no servidor), a leitura api.clinic_profile e a escrita campo a campo api.clinic_profile_set.
-- A escrita do gestor e do RT (api.clinic_responsible_set, com a cifra no servidor do Next) vem no PR seguinte.
-- Salvamento automático (§10.4.1): cada campo é gravado sozinho, devolve saved_at e vai para a trilha só com o NOME do
-- campo (tenant.profile_update), nunca o valor. CNPJ e razão social são protegidos (§10.4.3; Segurança e TL): só o
-- primeiro preenchimento é livre; depois, a troca vai para o fluxo protegido do backoffice (ADR 0006, item à parte).

-- ---------------------------------------------------------------------------------------------------------------
-- Dados da empresa e de contato (de empresa, não pessoais): colunas de platform.tenant. Todas nulas até preenchidas.
-- ---------------------------------------------------------------------------------------------------------------
alter table platform.tenant
  add column tax_registration text constraint tenant_tax_registration_check
    check (tax_registration is null or tax_registration ~ '^[0-9A-Za-z./-]{2,30}$'),
  add column main_specialty text constraint tenant_main_specialty_check
    check (main_specialty is null or (main_specialty = btrim(main_specialty) and char_length(main_specialty) between 2 and 120)),
  add column address_cep text constraint tenant_address_cep_check check (address_cep is null or address_cep ~ '^[0-9]{8}$'),
  add column address_street text constraint tenant_address_street_check
    check (address_street is null or (address_street = btrim(address_street) and char_length(address_street) between 2 and 200)),
  add column address_number text constraint tenant_address_number_check
    check (address_number is null or (address_number = btrim(address_number) and char_length(address_number) between 1 and 20)),
  add column address_complement text constraint tenant_address_complement_check
    check (address_complement is null or (address_complement = btrim(address_complement) and char_length(address_complement) between 1 and 120)),
  add column address_city text constraint tenant_address_city_check
    check (address_city is null or (address_city = btrim(address_city) and char_length(address_city) between 2 and 120)),
  add column address_uf text constraint tenant_address_uf_check check (address_uf is null or address_uf in
    ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  add column phone text constraint tenant_phone_check check (phone is null or phone ~ '^[1-9][0-9][0-9]{8,9}$'),
  -- celular com DDD: DDD válido + 9 + 8 dígitos
  add column clinic_whatsapp text constraint tenant_clinic_whatsapp_check
    check (clinic_whatsapp is null or clinic_whatsapp ~ '^[1-9][1-9]9[0-9]{8}$'),
  add column commercial_email text constraint tenant_commercial_email_check
    check (commercial_email is null or (commercial_email = lower(commercial_email) and char_length(commercial_email) <= 254
           and commercial_email ~ '^[^[:space:]@]+@[^[:space:]@.]+(\.[^[:space:]@.]+)+$')),
  -- o "salvo às" do topo (§10.4.1): último salvamento de qualquer campo do Perfil
  add column profile_saved_at timestamptz;

-- ---------------------------------------------------------------------------------------------------------------
-- Gestor e Responsável Técnico (dado pessoal): uma linha por (clínica, papel). CPF como o do paciente (HMAC do
-- servidor, máscara e cifrado), e-mail e WhatsApp cifrados, num envelope por linha (getCofre('network'), ADR 0002 §6,
-- AAD tenant_id|platform.tenant_responsible|<coluna>|<envelope_id>). As máscaras vêm prontas do servidor (o banco não
-- abre cifra). Sem nenhum grant: só as funções de api leem e gravam.
-- ---------------------------------------------------------------------------------------------------------------
create table platform.tenant_responsible (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenant (id),
  role text not null check (role in ('manager', 'technical_lead')),
  full_name text check (full_name is null or (full_name = btrim(full_name) and char_length(full_name) between 2 and 200)),
  cpf_hmac bytea check (cpf_hmac is null or octet_length(cpf_hmac) = 32),
  cpf_masked text,
  cpf_enc bytea,
  email_masked text,
  email_enc bytea,
  phone_masked text,
  phone_enc bytea,
  same_as_manager boolean not null default false,
  -- lista do RT no §10.4.1 ("Conselho (lista: CRM, CRBM, CRO, COREN, CREFITO)"); a de 8 do §10.4.3 é a do profissional
  council text check (council is null or council in ('crm', 'crbm', 'cro', 'coren', 'crefito')),
  council_uf text check (council_uf is null or council_uf ~ '^[A-Z]{2}$'),
  council_number text check (council_number is null or council_number ~ '^[0-9A-Za-z./-]{1,20}$'),
  envelope_id uuid not null,
  dek_wrapped bytea not null,
  kek_version smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_responsible_role_uq unique (tenant_id, role),
  constraint tenant_responsible_cpf_check check ((cpf_hmac is null) = (cpf_enc is null) and (cpf_hmac is null) = (cpf_masked is null)),
  constraint tenant_responsible_email_check check ((email_enc is null) = (email_masked is null)),
  constraint tenant_responsible_phone_check check ((phone_enc is null) = (phone_masked is null)),
  -- só o RT tem "mesma pessoa que o gestor" e conselho; o gestor não tem conselho nesta tela
  constraint tenant_responsible_rt_only_check check (role = 'technical_lead'
    or (not same_as_manager and council is null and council_uf is null and council_number is null)),
  -- RT "mesma pessoa": nome e CPF vêm do gestor, então a linha do RT não guarda os dela
  constraint tenant_responsible_same_check check (not same_as_manager or (full_name is null and cpf_hmac is null))
);
alter table platform.tenant_responsible enable row level security;
alter table platform.tenant_responsible force row level security;
revoke all on platform.tenant_responsible from public, anon, authenticated, service_role;
create trigger tenant_responsible_set_updated_at before update on platform.tenant_responsible
  for each row execute function private.set_updated_at();

-- Escrita da clínica só por função, com validação e trilha (Segurança e TL no #296): o grant de coluna antigo
-- (update de name e timezone, MIG-02) sai, e a policy de update com ele. Nenhum código do app grava direto na tabela.
revoke update on platform.tenant from authenticated;
drop policy tenant_update on platform.tenant;

insert into audit.action (action, kind, scope) values
  ('tenant.profile_update', 'change', 'tenant'),
  ('tenant.profile_read', 'access', 'tenant')
on conflict (action) do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- CNPJ pelo dígito verificador (Receita), já no formato alfanumérico (IN RFB 2.229/2024; decisão do CTO, 21/11):
-- as 12 primeiras posições aceitam 0-9 e A-Z, os 2 DV são numéricos, e cada posição vale ASCII - 48 (os dígitos
-- continuam valendo eles mesmos, então o CNPJ numérico de hoje dá o mesmo DV). Não aceita todas as posições iguais.
-- ---------------------------------------------------------------------------------------------------------------
create function private.cnpj_is_valid(p text) returns boolean
language plpgsql immutable set search_path = ''
as $$
declare
  w1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  w2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int;
  d1 int;
  d2 int;
begin
  if p is null or p !~ '^[0-9A-Z]{12}[0-9]{2}$' or p ~ '^(.)\1{13}$' then
    return false;
  end if;
  s := 0;
  for i in 1..12 loop s := s + (ascii(substr(p, i, 1)) - 48) * w1[i]; end loop;
  d1 := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  s := 0;
  for i in 1..13 loop s := s + (ascii(substr(p, i, 1)) - 48) * w2[i]; end loop;
  d2 := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  return substr(p, 13, 1)::int = d1 and substr(p, 14, 1)::int = d2;
end;
$$;
revoke all on function private.cnpj_is_valid(text) from public, anon, authenticated, service_role;

-- O CNPJ guardado é sempre a forma + o DV (contrato do Tech Lead, ADR 0001 §"CNPJ alfanumérico"): maiúsculas, sem
-- pontuação. A forma fica no CHECK da coluna; o DV, num gatilho SECURITY DEFINER que só dispara quando o CNPJ muda.
-- (Uma função no CHECK exigiria EXECUTE de quem grava a linha, e o private só abre as funções de policy: portões do
-- MIG-02.) Os CNPJs fictícios que já estão no banco (seed e nuvem) passam no DV.
alter table platform.tenant drop constraint tenant_cnpj_check;
alter table platform.tenant add constraint tenant_cnpj_check check (cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$');

create function private.tenant_cnpj_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.cnpj is not null and not private.cnpj_is_valid(new.cnpj) then
    raise exception using errcode = '23514', message = 'ATTA-IN-0001', detail = 'cnpj';
  end if;
  return new;
end;
$$;
revoke all on function private.tenant_cnpj_guard() from public, anon, authenticated, service_role;
create trigger tenant_cnpj_guard before insert or update of cnpj on platform.tenant
  for each row execute function private.tenant_cnpj_guard();

-- ---------------------------------------------------------------------------------------------------------------
-- O que falta para consolidar documentos (§10.4.1: "enquanto faltar CNPJ, gestor ou RT completos"). Uma regra só,
-- aqui no banco; a tela só mostra.
-- ---------------------------------------------------------------------------------------------------------------
create function private.clinic_profile_missing(p_tenant uuid) returns text[]
language sql stable security definer set search_path = ''
as $$
  with t as (select * from platform.tenant where id = p_tenant),
  g as (select * from platform.tenant_responsible where tenant_id = p_tenant and role = 'manager'),
  r as (select * from platform.tenant_responsible where tenant_id = p_tenant and role = 'technical_lead')
  select coalesce(array_agg(f order by o), '{}') from (
    select 1 o, 'legal_name' f from t where legal_name is null
    union all select 2, 'cnpj' from t where cnpj is null
    union all select 3, 'main_specialty' from t where main_specialty is null
    union all select 4, 'manager.full_name' where not exists (select 1 from g where full_name is not null)
    union all select 5, 'manager.cpf' where not exists (select 1 from g where cpf_hmac is not null)
    union all select 6, 'manager.email' where not exists (select 1 from g where email_enc is not null)
    union all select 7, 'manager.whatsapp' where not exists (select 1 from g where phone_enc is not null)
    union all select 8, 'technical_lead.full_name' where not exists (select 1 from r where same_as_manager or full_name is not null)
    union all select 9, 'technical_lead.cpf' where not exists (select 1 from r where same_as_manager or cpf_hmac is not null)
    union all select 10, 'technical_lead.council' where not exists (select 1 from r where council is not null)
    union all select 11, 'technical_lead.council_uf' where not exists (select 1 from r where council_uf is not null)
    union all select 12, 'technical_lead.council_number' where not exists (select 1 from r where council_number is not null)
    union all select 13, 'address_cep' from t where address_cep is null
    union all select 14, 'address_street' from t where address_street is null
    union all select 15, 'address_number' from t where address_number is null
    union all select 16, 'address_city' from t where address_city is null
    union all select 17, 'address_uf' from t where address_uf is null
    union all select 18, 'clinic_whatsapp' from t where clinic_whatsapp is null
  ) x
$$;
revoke all on function private.clinic_profile_missing(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Leitura: só ADMIN com aal2 (settings.view, conferido no banco). Os responsáveis saem só mascarados; o RT "mesma
-- pessoa" mostra o nome e o CPF mascarado do gestor. Vai para a trilha como leitura (há nome de pessoa).
-- ---------------------------------------------------------------------------------------------------------------
create function api.clinic_profile() returns jsonb
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
-- Escrita de um campo da empresa (settings.edit, ADMIN com aal2). Lista fechada; o valor chega normalizado (só dígitos
-- no CNPJ, no CEP e nos telefones; e-mail em minúsculas) e é validado aqui (formato e, no CNPJ, o dígito). Nulo
-- apaga um campo opcional ou obrigatório (o aviso do topo mostra); o nome fantasia e o fuso não ficam vazios.
-- CNPJ e razão social: só o primeiro preenchimento (nulo -> valor). Depois, protected_field.
-- ---------------------------------------------------------------------------------------------------------------
create function api.clinic_profile_set(p_field text, p_value text) returns timestamptz
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_value text := nullif(btrim(p_value), '');
  v_now timestamptz := now();
  t platform.tenant;
begin
  if v_tenant is null or not coalesce((select private.has_permission('settings', 'edit')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if p_field is null or p_field not in ('trade_name', 'legal_name', 'cnpj', 'tax_registration', 'main_specialty',
       'address_cep', 'address_street', 'address_number', 'address_complement', 'address_city', 'address_uf', 'phone',
       'clinic_whatsapp', 'commercial_email', 'timezone') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'field';
  end if;
  select * into t from platform.tenant where id = v_tenant and deleted_at is null for update;
  -- CNPJ: normaliza antes de gravar como o normalizarCnpj (#291): maiúsculas, sem ponto, barra, hífen e espaço;
  -- outro caractere fica e cai na validação
  if p_field = 'cnpj' then
    v_value := nullif(regexp_replace(upper(v_value), '[./[:space:]-]', '', 'g'), '');
  end if;

  if p_field in ('cnpj', 'legal_name') and (case when p_field = 'cnpj' then t.cnpj else t.legal_name end) is not null then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'protected_field';
  end if;
  if (p_field in ('trade_name', 'timezone') and v_value is null)
     or (p_field = 'timezone' and not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_value))
     or (p_field = 'cnpj' and v_value is not null and not private.cnpj_is_valid(v_value))
     or (p_field = 'address_uf' and v_value is not null and v_value <> upper(v_value))
     or (p_field = 'commercial_email' and v_value is not null and v_value <> lower(v_value)) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = p_field;
  end if;

  begin
    update platform.tenant set
      name = case when p_field = 'trade_name' then v_value else name end,
      legal_name = case when p_field = 'legal_name' then v_value else legal_name end,
      cnpj = case when p_field = 'cnpj' then v_value else cnpj end,
      tax_registration = case when p_field = 'tax_registration' then v_value else tax_registration end,
      main_specialty = case when p_field = 'main_specialty' then v_value else main_specialty end,
      address_cep = case when p_field = 'address_cep' then v_value else address_cep end,
      address_street = case when p_field = 'address_street' then v_value else address_street end,
      address_number = case when p_field = 'address_number' then v_value else address_number end,
      address_complement = case when p_field = 'address_complement' then v_value else address_complement end,
      address_city = case when p_field = 'address_city' then v_value else address_city end,
      address_uf = case when p_field = 'address_uf' then v_value else address_uf end,
      phone = case when p_field = 'phone' then v_value else phone end,
      clinic_whatsapp = case when p_field = 'clinic_whatsapp' then v_value else clinic_whatsapp end,
      commercial_email = case when p_field = 'commercial_email' then v_value else commercial_email end,
      timezone = case when p_field = 'timezone' then v_value else timezone end,
      profile_saved_at = v_now
    where id = v_tenant;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'cnpj_in_use';
  when check_violation then
    -- formato fora do contrato: a mesma resposta de validação, com o nome do campo (nunca o valor)
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = p_field;
  end;

  perform audit.record_event('tenant.profile_update', 'platform.tenant', v_tenant, jsonb_build_object('field', p_field));
  return v_now;
end;
$$;

revoke all on function api.clinic_profile(), api.clinic_profile_set(text, text) from public, anon;
grant execute on function api.clinic_profile(), api.clinic_profile_set(text, text) to authenticated;
