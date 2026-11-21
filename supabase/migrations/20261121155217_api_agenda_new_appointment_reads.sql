-- MIG-11: leituras do modal "Agendar Novo Atendimento" (PDD v206 §10.2, "Modal Agendar Novo Atendimento" e "Duração do
-- atendimento"; contrato aprovado pelo Tech Lead em desenho/mig-41-novo-agendamento-contrato.md, itens 2, 3 e 4).
--   - Duração por tipo pela configuração da clínica (§10.2: "Consulta …, Avaliação e Retorno têm duração configurada pela
--     clínica em Configurações. Padrões decididos pela PO: Consulta 60 min, Avaliação 30 min e Retorno 30 min"). Três
--     chaves novas no catálogo, de 5 a 480 min; aparecem na tela de Configurações › Agendamentos (settings_screen). O
--     "por conselho profissional" da Consulta foi ao CTO; até a resposta, um valor por clínica. Procedimento = soma das
--     durações dos Serviços escolhidos.
--   - api.agenda_professional_services: Serviços ativos que o profissional pode fazer na clínica, com a duração.
--   - api.agenda_free_slots: horários livres de um profissional num dia, "em passos de 1 hora, só onde cabe a duração
--     total" (§10.2), na janela do horário dele, fora da pausa, fora de data especial e sem cruzar agendamento que ocupa
--     horário (não conta Cancelado nem Ausente). Dia passado: nenhum; hoje: só os futuros. Mais o primeiro livre em até
--     60 dias quando o dia pedido não tem nenhum.
-- Tudo com appointments.view e o tenant do token.

insert into atta_in.setting_definition (key, value_type, default_int, default_bool, allowed_ints, min_int, max_int)
values
  ('duracao_consulta_min', 'int', 60, null, null, 5, 480),
  ('duracao_avaliacao_min', 'int', 30, null, null, 5, 480),
  ('duracao_retorno_min', 'int', 30, null, null, 5, 480);

-- valor de uma chave inteira no nível da clínica (unidade) ou o padrão do sistema
create function private.tenant_setting_int(p_tenant uuid, p_key text) returns bigint
language sql stable security definer set search_path = ''
as $$
  select coalesce((select s.value_int from atta_in.setting s
                   where s.tenant_id = p_tenant and s.key = p_key and s.level = 'unidade'),
                  (select d.default_int from atta_in.setting_definition d where d.key = p_key))
$$;
revoke all on function private.tenant_setting_int(uuid, text) from public, anon, authenticated, service_role;

create function api.agenda_durations() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
begin
  if v_tenant is null or not coalesce((select private.has_permission('appointments', 'view')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  return jsonb_build_object('consulta', private.tenant_setting_int(v_tenant, 'duracao_consulta_min'),
                            'avaliacao', private.tenant_setting_int(v_tenant, 'duracao_avaliacao_min'),
                            'retorno', private.tenant_setting_int(v_tenant, 'duracao_retorno_min'));
end;
$$;
revoke all on function api.agenda_durations() from public, anon;
grant execute on function api.agenda_durations() to authenticated;

create function api.agenda_professional_services(p_professional_link_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
begin
  if v_tenant is null or not coalesce((select private.has_permission('appointments', 'view')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if not exists (select 1 from platform.professional_tenant_link l
                 where l.tenant_id = v_tenant and l.id = p_professional_link_id and l.deleted_at is null) then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'professional_link_id';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', cs.id, 'name', cs.name, 'category', cs.category,
                                                       'duration_min', cs.duration_min, 'requires_rt', cs.requires_rt)
                                    order by lower(cs.name), cs.id)
                   from atta_in.professional_service ps
                   join atta_in.clinic_service cs on cs.tenant_id = ps.tenant_id and cs.id = ps.clinic_service_id
                   where ps.tenant_id = v_tenant and ps.professional_link_id = p_professional_link_id
                     and cs.active and cs.deleted_at is null), '[]'::jsonb);
end;
$$;
revoke all on function api.agenda_professional_services(uuid) from public, anon;
grant execute on function api.agenda_professional_services(uuid) to authenticated;

-- os inícios livres de um dia (horário local da clínica), em passos de 1 h a partir do início de cada janela
create function private.free_slots(p_tenant uuid, p_link uuid, p_day date, p_duration_min int)
returns setof timestamptz
language sql stable security definer set search_path = ''
as $$
  with ctx as (
    select t.timezone as tz, (now() at time zone t.timezone)::date as today from platform.tenant t where t.id = p_tenant
  ),
  candidatos as (
    select (s.inicio at time zone c.tz) as inicio
    from ctx c
    join atta_in.professional_schedule ps
      on ps.tenant_id = p_tenant and ps.professional_link_id = p_link
     and extract(dow from p_day)::smallint = any (ps.weekdays)
    cross join lateral generate_series(p_day + ps.starts_at, p_day + ps.ends_at - make_interval(mins => p_duration_min),
                                       interval '1 hour') as s (inicio)
    where p_day >= c.today
      -- data especial: clínica fechada ou profissional ausente no dia
      and not exists (select 1 from atta_in.special_date sd
                      where sd.tenant_id = p_tenant and p_day between sd.starts_on and sd.ends_on
                        and (sd.kind = 'clinica_fechada'
                             or (sd.kind = 'profissional_ausente' and sd.professional_link_id = p_link)))
      -- fora da pausa do profissional
      and not exists (select 1 from atta_in.professional_break pb
                      where pb.tenant_id = p_tenant and pb.professional_link_id = p_link
                        and extract(dow from p_day)::smallint = any (pb.weekdays)
                        and (p_day + pb.starts_at) < s.inicio + make_interval(mins => p_duration_min)
                        and (p_day + pb.ends_at) > s.inicio)
  )
  select k.inicio from candidatos k
  where k.inicio > now()
    and not exists (select 1 from atta_in.appointment a
                    where a.tenant_id = p_tenant and a.professional_link_id = p_link
                      and a.status not in ('cancelado', 'ausente')
                      and a.starts_at < k.inicio + make_interval(mins => p_duration_min) and a.ends_at > k.inicio)
  order by k.inicio
$$;
revoke all on function private.free_slots(uuid, uuid, date, int) from public, anon, authenticated, service_role;

create function api.agenda_free_slots(p_professional_link_id uuid, p_local_date date, p_duration_min int) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_tz text;
  v_slots jsonb;
  v_next jsonb;
  v_day date;
  v_first timestamptz;
begin
  if v_tenant is null or not coalesce((select private.has_permission('appointments', 'view')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if p_local_date is null or p_duration_min is null or p_duration_min not between 5 and 480 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'query';
  end if;
  if not exists (select 1 from platform.professional_tenant_link l
                 where l.tenant_id = v_tenant and l.id = p_professional_link_id and l.deleted_at is null) then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'professional_link_id';
  end if;
  select t.timezone into v_tz from platform.tenant t where t.id = v_tenant;
  select coalesce(jsonb_agg(to_jsonb(s) order by s), '[]'::jsonb) into v_slots
  from private.free_slots(v_tenant, p_professional_link_id, p_local_date, p_duration_min) s;
  -- o dia pedido sem horário: o primeiro livre nos 60 dias seguintes
  if v_slots = '[]'::jsonb then
    for i in 1..60 loop
      v_day := p_local_date + i;
      select min(s) into v_first from private.free_slots(v_tenant, p_professional_link_id, v_day, p_duration_min) s;
      if v_first is not null then
        v_next := jsonb_build_object('local_date', v_day, 'starts_at', v_first);
        exit;
      end if;
    end loop;
  end if;
  return jsonb_build_object('local_date', p_local_date, 'timezone', v_tz, 'slots', v_slots,
                            'first_free', v_slots -> 0, 'next_free', v_next);
end;
$$;
revoke all on function api.agenda_free_slots(uuid, date, int) from public, anon;
grant execute on function api.agenda_free_slots(uuid, date, int) to authenticated;
