-- MIG-10b: Configurações › Agendamentos (PDD v206 §10.2.1, §11.3 e §15.5; tela do MIG-42) e o endurecimento S3-2 da
-- auditoria de segurança (Security Engineer, 20/11).
--
-- 1. Link Check-in Online: antecedência do envio, validade depois do horário e os dois lembretes, com os padrões do PDD
--    (RN-AGN-CONV-01: 3 h antes, até 1 h depois, lembretes de 60 e 30 min, "configurável pela clínica").
--    PDD omisso: limites decididos pelo CTO (R9). Regras cruzadas no banco: o 2º lembrete vem antes do 1º, e o 1º cabe
--    na antecedência do envio.
-- 2. Celulares da clínica para o Fluxo alternativo (§11.3/§15: "O link do check-in vai ao celular que a clínica cadastrou
--    em Configurações > Agendamentos"): até 10. O número vai cifrado com envelope (ADR 0002, getCofre('network'),
--    AAD tenant_id|atta_in.alt_flow_phone|phone_enc|<id>, id gerado no servidor) e o painel lê só a máscara; o número
--    inteiro só sai no servidor, para o envio (Tech Lead).
-- 3. Leitura da tela numa chamada: valor efetivo, origem, padrão e limites (atta_in.settings_screen).
-- 4. S3-2: atta_in.setting com grant por coluna (ninguém grava created_by, updated_by, key nem level por fora) e toda
--    mudança na auditoria, por gatilho (vale também para quem escrever direto na tabela).

insert into atta_in.setting_definition (key, value_type, default_int, default_bool, allowed_ints, min_int, max_int)
values
  ('link_envio_antecedencia_h', 'int', 3, null, null, 1, 24),
  ('link_validade_apos_h', 'int', 1, null, null, 0, 4),
  ('lembrete_1_min', 'int', 60, null, null, 15, 240),
  ('lembrete_2_min', 'int', 30, null, null, 5, 120);

-- ---------------------------------------------------------------------------------------------------------------
-- Regras cruzadas do Link Check-in Online, no escopo gravado (o efetivo depois da escrita)
-- ---------------------------------------------------------------------------------------------------------------
create function atta_in.check_link_rules(p_appointment_type text, p_clinic_service_id uuid) returns void
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_envio bigint;
  v_l1 bigint;
  v_l2 bigint;
begin
  select (e.value)::text::bigint into v_envio from atta_in.effective_settings(p_appointment_type, p_clinic_service_id) e
  where e.key = 'link_envio_antecedencia_h';
  select (e.value)::text::bigint into v_l1 from atta_in.effective_settings(p_appointment_type, p_clinic_service_id) e
  where e.key = 'lembrete_1_min';
  select (e.value)::text::bigint into v_l2 from atta_in.effective_settings(p_appointment_type, p_clinic_service_id) e
  where e.key = 'lembrete_2_min';
  if v_l2 >= v_l1 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'lembrete_2_min';
  end if;
  if v_l1 > v_envio * 60 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'lembrete_1_min';
  end if;
end;
$$;
revoke all on function atta_in.check_link_rules(text, uuid) from public, anon;
grant execute on function atta_in.check_link_rules(text, uuid) to authenticated;

-- set_setting passa a conferir as regras cruzadas depois de gravar (a transação inteira volta se não couber)
create or replace function atta_in.set_setting(
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

  if p_key in ('link_envio_antecedencia_h', 'lembrete_1_min', 'lembrete_2_min') then
    perform atta_in.check_link_rules(p_appointment_type, p_clinic_service_id);
  end if;

  return query select p_key,
    case when d.value_type = 'bool' then to_jsonb(v_bool) else to_jsonb(v_int) end,
    v_level;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Leitura da tela: valor efetivo, origem, padrão e limites, uma linha por chave
-- ---------------------------------------------------------------------------------------------------------------
create function atta_in.settings_screen(
  p_appointment_type text default null,
  p_clinic_service_id uuid default null
) returns table (key text, value_type text, value_int bigint, value_bool boolean, source text, default_int bigint,
                 default_bool boolean, min_int bigint, max_int bigint, allowed_ints bigint[])
  language sql stable security invoker set search_path = ''
as $$
  select d.key, d.value_type,
         case when d.value_type = 'int' then (e.value)::text::bigint end,
         case when d.value_type = 'bool' then (e.value)::text::boolean end,
         e.level, d.default_int, d.default_bool, d.min_int, d.max_int, d.allowed_ints
  from atta_in.effective_settings(p_appointment_type, p_clinic_service_id) e
  join atta_in.setting_definition d on d.key = e.key
  order by d.key
$$;
revoke all on function atta_in.settings_screen(text, uuid) from public, anon;
grant execute on function atta_in.settings_screen(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- S3-2: grant por coluna em atta_in.setting e quem mudou carimbado pelo banco
-- ---------------------------------------------------------------------------------------------------------------
revoke insert, update on atta_in.setting from authenticated;
grant insert (tenant_id, key, level, appointment_type, clinic_service_id, value_int, value_bool)
  on atta_in.setting to authenticated;
grant update (value_int, value_bool) on atta_in.setting to authenticated;

create function atta_in.setting_stamp() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
revoke all on function atta_in.setting_stamp() from public, anon, authenticated;
create trigger setting_stamp before update on atta_in.setting
  for each row execute function atta_in.setting_stamp();

-- toda mudança de configuração na auditoria (ADR 0003: kind change, before/after só do valor)
insert into audit.action (action, kind) values
  ('setting.change', 'change'),
  ('alt_flow_phone.change', 'change')
on conflict (action) do nothing;

create function atta_in.audit_setting() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.value_int is not distinct from old.value_int
     and new.value_bool is not distinct from old.value_bool then
    return new;
  end if;
  perform audit.record_event('setting.change', 'atta_in.setting', new.id,
    jsonb_build_object('key', new.key, 'level', new.level, 'op', lower(tg_op)),
    case when tg_op = 'UPDATE' then jsonb_build_object('value', coalesce(to_jsonb(old.value_int), to_jsonb(old.value_bool)))
         else '{}'::jsonb end,
    jsonb_build_object('value', coalesce(to_jsonb(new.value_int), to_jsonb(new.value_bool))),
    new.tenant_id);
  return new;
end;
$$;
revoke all on function atta_in.audit_setting() from public, anon, authenticated;
create trigger setting_audit after insert or update on atta_in.setting
  for each row execute function atta_in.audit_setting();

-- ---------------------------------------------------------------------------------------------------------------
-- Celulares da clínica para o Fluxo alternativo
-- ---------------------------------------------------------------------------------------------------------------
create table atta_in.alt_flow_phone (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenant (id),
  label text not null,
  phone_masked text not null,          -- gerada no servidor, depois de validar DDD + 9 + 8 dígitos (§16.6)
  phone_enc bytea not null,
  dek_wrapped bytea not null,
  kek_version smallint not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint alt_flow_phone_label_check check (length(btrim(label)) between 1 and 40),
  constraint alt_flow_phone_masked_check check (length(phone_masked) between 4 and 20)
);

alter table atta_in.alt_flow_phone enable row level security;
alter table atta_in.alt_flow_phone force row level security;
revoke all on atta_in.alt_flow_phone from public, anon, authenticated;
-- o painel lê só a máscara; número cifrado e envelope ficam fora do grant de leitura (o envio lê pelo servidor)
grant select (id, tenant_id, label, phone_masked, created_at) on atta_in.alt_flow_phone to authenticated;
grant delete on atta_in.alt_flow_phone to authenticated;
grant insert (id, tenant_id, label, phone_masked, phone_enc, dek_wrapped, kek_version)
  on atta_in.alt_flow_phone to authenticated;   -- editar = remover e adicionar

create policy alt_flow_phone_select on atta_in.alt_flow_phone for select to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('settings', 'view')));
create policy alt_flow_phone_insert on atta_in.alt_flow_phone for insert to authenticated
  with check (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('settings', 'edit')));
create policy alt_flow_phone_delete on atta_in.alt_flow_phone for delete to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('settings', 'edit')));

-- no máximo 10 por clínica; e cada inclusão e remoção na auditoria (sem o número nem o nome no detalhe)
create function atta_in.alt_flow_phone_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('alt_flow_phone:' || new.tenant_id::text, 0));
    if (select count(*) from atta_in.alt_flow_phone p where p.tenant_id = new.tenant_id) >= 10 then
      raise exception using errcode = 'P0001', message = 'ATTA-IN-0003', detail = 'alt_flow_phone';
    end if;
    return new;
  end if;
  return old;
end;
$$;
revoke all on function atta_in.alt_flow_phone_guard() from public, anon, authenticated;
create trigger alt_flow_phone_guard before insert on atta_in.alt_flow_phone
  for each row execute function atta_in.alt_flow_phone_guard();

create function atta_in.audit_alt_flow_phone() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r atta_in.alt_flow_phone := case when tg_op = 'DELETE' then old else new end;
begin
  perform audit.record_event('alt_flow_phone.change', 'atta_in.alt_flow_phone', r.id,
    jsonb_build_object('op', lower(tg_op)), null, null, r.tenant_id);
  return r;
end;
$$;
revoke all on function atta_in.audit_alt_flow_phone() from public, anon, authenticated;
create trigger alt_flow_phone_audit after insert or delete on atta_in.alt_flow_phone
  for each row execute function atta_in.audit_alt_flow_phone();
