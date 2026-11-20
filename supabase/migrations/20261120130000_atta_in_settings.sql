-- MIG-10: configurações da clínica em cascata (porte da 0002_setting e do domínio do ENG-186; hub-atta/atta-in #1–#3).
--
-- Cascata do PDD v206 §16.3, da menor para a maior precedência: sistema → rede → unidade → tipo de atendimento →
-- Serviço. Vence a definição mais específica que se aplica, e a leitura devolve o valor e o nível de onde ele veio.
-- O padrão do sistema mora em atta_in.setting_definition (igual para toda clínica, muda por migration). O nível
-- "rede" existe na ordem, mas ainda não é gravado: a herança de Grupo vem depois, por função (decisão 0001 §2).
--
-- Padrões e limites (decisões do dono e da PO, 19/11/2026):
--   janela_de_confirmacao_h      72 h (PO), de 1 a 720 (teto do dono)       PDD §10.2.1
--   tolerancia_da_ausencia_min   120 (2 h, PO); 0, 15, 30, 60, 90 ou 120     PDD §15.5 (0 = desativado)
--   fluxo_alternativo_habilitado true (confirmado pelo dono)                PDD §11.3
-- Tipos de atendimento (PDD v204 §10.2.1, contrato appointment_type.v1): consulta, avaliacao, procedimento, retorno.
--
-- Acesso: private.has_permission('settings', ...), que só o ADMIN da própria clínica tem (Configurações é exclusiva do
-- ADMIN, PDD §10.4.3; decisão do Tech Lead, 20/11). Sem DELETE:
-- "voltar a herdar" é tarefa própria. O tenant vem sempre do token (private.current_tenant_id()), nunca do corpo.

-- ---------------------------------------------------------------------------------------------------------------
-- Catálogo: o padrão do sistema e o que cada parâmetro aceita (global, sem tenant; só leitura)
-- ---------------------------------------------------------------------------------------------------------------
create table atta_in.setting_definition (
  key text primary key,
  value_type text not null,
  default_int bigint,
  default_bool boolean,
  allowed_ints bigint[],
  min_int bigint,
  max_int bigint,
  created_at timestamptz not null default now(),
  constraint setting_definition_value_type_check check (value_type in ('int', 'bool')),
  constraint setting_definition_default_check check (
    (value_type = 'int' and default_int is not null and default_bool is null)
    or (value_type = 'bool' and default_bool is not null and default_int is null
        and allowed_ints is null and min_int is null and max_int is null)
  )
);

insert into atta_in.setting_definition (key, value_type, default_int, default_bool, allowed_ints, min_int, max_int)
values
  ('janela_de_confirmacao_h', 'int', 72, null, null, 1, 720),
  ('tolerancia_da_ausencia_min', 'int', 120, null, array[0, 15, 30, 60, 90, 120], null, null),
  ('fluxo_alternativo_habilitado', 'bool', null, true, null, null, null);

alter table atta_in.setting_definition enable row level security;
alter table atta_in.setting_definition force row level security;
revoke all on atta_in.setting_definition from public, anon, authenticated;
grant select on atta_in.setting_definition to authenticated;
create policy setting_definition_read on atta_in.setting_definition
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------------------------------------------
-- Valores que a clínica define: uma linha por parâmetro, nível e escopo do nível
-- ---------------------------------------------------------------------------------------------------------------
create table atta_in.setting (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenant (id),
  key text not null references atta_in.setting_definition (key),
  level text not null,
  appointment_type text,
  clinic_service_id uuid,                -- FK para o catálogo de Serviços quando ele existir (MIG-11)
  value_int bigint,
  value_bool boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  constraint setting_level_check check (level in ('unidade', 'tipo_de_atendimento', 'servico')),
  constraint setting_appointment_type_check
    check (appointment_type in ('consulta', 'avaliacao', 'procedimento', 'retorno')),
  constraint setting_scope_check check (
    (level = 'unidade' and appointment_type is null and clinic_service_id is null)
    or (level = 'tipo_de_atendimento' and appointment_type is not null and clinic_service_id is null)
    or (level = 'servico' and clinic_service_id is not null and appointment_type is null)
  ),
  constraint setting_one_value_check check (num_nonnulls(value_int, value_bool) = 1)
);

-- um valor por parâmetro em cada escopo; todo índice começa por tenant_id (decisão 0001 §2)
create unique index setting_unidade_uq on atta_in.setting (tenant_id, key) where level = 'unidade';
create unique index setting_tipo_uq on atta_in.setting (tenant_id, key, appointment_type)
  where level = 'tipo_de_atendimento';
create unique index setting_servico_uq on atta_in.setting (tenant_id, key, clinic_service_id) where level = 'servico';

-- O valor tem de caber no catálogo (tipo, conjunto, faixa) mesmo quando a escrita não passa pela função: a regra fica
-- no banco, não na tela. Erro ATTA-IN-0001 no campo value (o mesmo código do ENG-186).
create function atta_in.setting_check_value() returns trigger
  language plpgsql set search_path = ''
as $$
declare
  d atta_in.setting_definition;
begin
  select * into d from atta_in.setting_definition sd where sd.key = new.key;
  if d.value_type = 'bool' then
    if new.value_bool is null or new.value_int is not null then
      raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'value';
    end if;
  elsif new.value_int is null or new.value_bool is not null
        or (d.allowed_ints is not null and not new.value_int = any (d.allowed_ints))
        or (d.min_int is not null and new.value_int < d.min_int)
        or (d.max_int is not null and new.value_int > d.max_int) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'value';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger setting_check_value before insert or update on atta_in.setting
  for each row execute function atta_in.setting_check_value();

alter table atta_in.setting enable row level security;
alter table atta_in.setting force row level security;
revoke all on atta_in.setting from public, anon, authenticated;
grant select, insert, update on atta_in.setting to authenticated;   -- sem DELETE

create policy setting_select on atta_in.setting for select to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('settings', 'view')));
create policy setting_insert on atta_in.setting for insert to authenticated
  with check (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('settings', 'edit')));
create policy setting_update on atta_in.setting for update to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('settings', 'edit')))
  with check (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('settings', 'edit')));

-- ---------------------------------------------------------------------------------------------------------------
-- Leitura: o valor efetivo de cada parâmetro no contexto pedido, com o nível de origem (RPC do painel)
-- ---------------------------------------------------------------------------------------------------------------
create function atta_in.effective_settings(
  p_appointment_type text default null,
  p_clinic_service_id uuid default null
) returns table (key text, value jsonb, level text)
  language plpgsql stable security invoker set search_path = ''
as $$
#variable_conflict use_column
begin
  if not coalesce((select private.has_permission('settings', 'view')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if p_appointment_type is not null
     and p_appointment_type not in ('consulta', 'avaliacao', 'procedimento', 'retorno') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'appointment_type';
  end if;
  return query
  select d.key,
         case when d.value_type = 'bool' then to_jsonb(coalesce(s.value_bool, d.default_bool))
              else to_jsonb(coalesce(s.value_int, d.default_int)) end,
         coalesce(s.level, 'sistema')
  from atta_in.setting_definition d
  left join lateral (
    -- a definição mais específica que se aplica ao contexto; a RLS já restringe à clínica do token
    select st.level, st.value_int, st.value_bool
    from atta_in.setting st
    where st.key = d.key
      and (st.level = 'unidade'
           or (st.level = 'tipo_de_atendimento' and st.appointment_type = p_appointment_type)
           or (st.level = 'servico' and st.clinic_service_id = p_clinic_service_id))
    order by case st.level when 'servico' then 3 when 'tipo_de_atendimento' then 2 else 1 end desc
    limit 1
  ) s on true
  order by d.key;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Gravação: o valor no nível do escopo pedido (unidade, tipo de atendimento ou Serviço, nunca os dois)
-- ---------------------------------------------------------------------------------------------------------------
create function atta_in.set_setting(
  p_key text,
  p_value jsonb,
  p_appointment_type text default null,
  p_clinic_service_id uuid default null
) returns table (key text, value jsonb, level text)
  language plpgsql volatile security invoker set search_path = ''
as $$
#variable_conflict use_column
declare
  d atta_in.setting_definition;
  v_level text;
  v_int bigint;
  v_bool boolean;
  v_tenant uuid := (select private.current_tenant_id());
begin
  if v_tenant is null or not coalesce((select private.has_permission('settings', 'edit')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  select * into d from atta_in.setting_definition sd where sd.key = p_key;
  if not found then   -- chave fora do catálogo: 404, antes de olhar o valor
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'key';
  end if;
  if p_appointment_type is not null and p_clinic_service_id is not null then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'clinic_service_id';
  end if;
  if p_appointment_type is not null
     and p_appointment_type not in ('consulta', 'avaliacao', 'procedimento', 'retorno') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'appointment_type';
  end if;
  v_level := case when p_appointment_type is not null then 'tipo_de_atendimento'
                  when p_clinic_service_id is not null then 'servico'
                  else 'unidade' end;
  -- tipo estrito, sem conversão escondida: "72", 72.5, 72.0, null e 1 no lugar de true são recusados
  if d.value_type = 'bool' then
    if jsonb_typeof(p_value) is distinct from 'boolean' then
      raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'value';
    end if;
    v_bool := p_value::boolean;
  else
    if jsonb_typeof(p_value) is distinct from 'number' or p_value::text !~ '^-?[0-9]+$' then
      raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'value';
    end if;
    v_int := p_value::text::bigint;
  end if;

  if v_level = 'unidade' then
    insert into atta_in.setting (tenant_id, key, level, value_int, value_bool)
    values (v_tenant, p_key, v_level, v_int, v_bool)
    on conflict (tenant_id, key) where level = 'unidade'
    do update set value_int = excluded.value_int, value_bool = excluded.value_bool;
  elsif v_level = 'tipo_de_atendimento' then
    insert into atta_in.setting (tenant_id, key, level, appointment_type, value_int, value_bool)
    values (v_tenant, p_key, v_level, p_appointment_type, v_int, v_bool)
    on conflict (tenant_id, key, appointment_type) where level = 'tipo_de_atendimento'
    do update set value_int = excluded.value_int, value_bool = excluded.value_bool;
  else
    insert into atta_in.setting (tenant_id, key, level, clinic_service_id, value_int, value_bool)
    values (v_tenant, p_key, v_level, p_clinic_service_id, v_int, v_bool)
    on conflict (tenant_id, key, clinic_service_id) where level = 'servico'
    do update set value_int = excluded.value_int, value_bool = excluded.value_bool;
  end if;

  return query select p_key,
    case when d.value_type = 'bool' then to_jsonb(v_bool) else to_jsonb(v_int) end,
    v_level;
end;
$$;

revoke all on function atta_in.effective_settings(text, uuid) from public, anon;
revoke all on function atta_in.set_setting(text, jsonb, text, uuid) from public, anon;
revoke all on function atta_in.setting_check_value() from public, anon, authenticated;
grant execute on function atta_in.effective_settings(text, uuid) to authenticated;
grant execute on function atta_in.set_setting(text, jsonb, text, uuid) to authenticated;
