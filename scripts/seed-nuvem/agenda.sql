-- Agenda FICTÍCIA do stage, na Aurora e na Serena (pedido do CTO, 20/11), para o dono e a PO verem a Agenda com dados.
-- Roda depois do SQL dos profissionais (rodar-agenda.seed.ts) e com os pacientes do seed #94 já cadastrados. Sem chave
-- nem dado em claro: só ids, nomes de Serviço e horários. Idempotente: id fixo por clínica, dia e posição; agendamento
-- que já existe é pulado, com os seus estados. Rodar de novo num outro dia acrescenta os dias que faltam.
--   hoje e amanhã: os 9 estados da tela (um por estado), como o seed local do #141:
--     concluído · em atendimento · pronto · em preenchimento · ausente · atrasado · agendado · procedimento sem
--     documento · cancelado. Hoje, os horários são relativos à hora do comando (passados ficam antes, futuros depois,
--     presos ao dia); amanhã, fixos (o "atrasado" fica atrasado depois das 11h).
--   os 3 dias seguintes: 3 agendados por dia.
-- Os estados vêm da máquina de estados (atta_in.apply_transition, a mesma das ações da recepção), com trilha. Nenhum
-- modelo de documento está vinculado aos Serviços: todos aparecem "sem documento", como no seed local.

begin;

insert into atta_in.clinic_service (id, tenant_id, name, duration_min) values
  ('0a770000-0000-4000-8000-000000000401', '0a770000-0000-4000-8000-000000000001', 'Limpeza de pele', 60),
  ('0a770000-0000-4000-8000-000000000402', '0a770000-0000-4000-8000-000000000001', 'Avaliação facial', 30),
  ('0a770000-0000-4000-8000-000000000403', '0a770000-0000-4000-8000-000000000002', 'Peeling químico', 45),
  ('0a770000-0000-4000-8000-000000000404', '0a770000-0000-4000-8000-000000000002', 'Consulta dermatológica', 30)
on conflict do nothing;

insert into atta_in.professional_service (tenant_id, professional_link_id, clinic_service_id) values
  ('0a770000-0000-4000-8000-000000000001', '0a770000-0000-4000-8000-000000000311', '0a770000-0000-4000-8000-000000000401'),
  ('0a770000-0000-4000-8000-000000000001', '0a770000-0000-4000-8000-000000000311', '0a770000-0000-4000-8000-000000000402'),
  ('0a770000-0000-4000-8000-000000000001', '0a770000-0000-4000-8000-000000000312', '0a770000-0000-4000-8000-000000000401'),
  ('0a770000-0000-4000-8000-000000000002', '0a770000-0000-4000-8000-000000000313', '0a770000-0000-4000-8000-000000000403'),
  ('0a770000-0000-4000-8000-000000000002', '0a770000-0000-4000-8000-000000000313', '0a770000-0000-4000-8000-000000000404'),
  ('0a770000-0000-4000-8000-000000000002', '0a770000-0000-4000-8000-000000000314', '0a770000-0000-4000-8000-000000000404')
on conflict do nothing;

do $$
declare
  c record;
  s record;
  v_dia date;
  v_tz text;
  v_inicio timestamptz;
  v_fim timestamptz;
  v_pacientes uuid[];
  v_inicio_ag timestamptz;
  v_id uuid;
  v_novo uuid;
  v_n integer := 0;
  v_paciente integer;
begin
  for c in select * from (values
    (1, '0a770000-0000-4000-8000-000000000001'::uuid, '0a770000-0000-4000-8000-000000000311'::uuid,
        '0a770000-0000-4000-8000-000000000312'::uuid, '0a770000-0000-4000-8000-000000000401'::uuid),
    (2, '0a770000-0000-4000-8000-000000000002', '0a770000-0000-4000-8000-000000000313',
        '0a770000-0000-4000-8000-000000000314', '0a770000-0000-4000-8000-000000000403')
  ) x (n, tenant, prof_a, prof_b, servico)
  loop
    -- os pacientes do seed #94 dessa clínica que seguem ativos (arquivado não pode ser agendado)
    select array_agg(l.person_id order by l.person_id) into v_pacientes
    from network.person_tenant_link l
    where l.tenant_id = c.tenant and l.archived_at is null
      and l.person_id::text like format('0a770000-0000-4000-8000-000000010%s__', c.n);
    if coalesce(array_length(v_pacientes, 1), 0) < 9 then
      raise exception 'clínica % com menos de 9 pacientes do seed ativos', c.n;
    end if;
    v_paciente := 0;

    for d in 0..4 loop
      select t.timezone into v_tz from platform.tenant t where t.id = c.tenant;
      v_dia := (now() at time zone v_tz)::date + d;
      v_inicio := v_dia::timestamp at time zone v_tz;
      v_fim := v_inicio + interval '1 day' - interval '35 minutes';

      for s in select * from (values
        -- posição, tipo, profissional (a/b), Serviço?, desvio de hoje, hora fixa, estado final, dias em que entra
        (1, 'consulta',     'a', false, interval '-150 minutes', time '08:00', 'concluido',        'cheio'),
        (2, 'avaliacao',    'b', false, interval '-45 minutes',  time '09:00', 'em_atendimento',   'cheio'),
        (3, 'consulta',     'a', false, interval '-25 minutes',  time '09:30', 'pronto',           'cheio'),
        (4, 'consulta',     'b', false, interval '-10 minutes',  time '10:00', 'em_preenchimento', 'cheio'),
        (5, 'consulta',     'a', false, interval '-90 minutes',  time '10:30', 'ausente',          'cheio'),
        (6, 'consulta',     'b', false, interval '-35 minutes',  time '11:00', 'agendado',         'todos'),
        (7, 'consulta',     'a', false, interval '60 minutes',   time '16:00', 'agendado',         'todos'),
        (8, 'procedimento', 'a', true,  interval '120 minutes',  time '17:00', 'agendado',         'todos'),
        (9, 'consulta',     'b', false, interval '90 minutes',   time '14:00', 'cancelado',        'cheio')
      ) y (pos, tipo, prof, com_servico, desvio, hora, estado, quando)
      loop
        continue when d >= 2 and s.quando = 'cheio';
        v_id := format('0a770000-0000-4000-8000-03%s%s%s', c.n, to_char(v_dia, 'YYYYMMDD'), s.pos)::uuid;
        v_inicio_ag := case when d = 0 then least(greatest(now() + s.desvio, v_inicio), v_fim)
                            else (v_dia + s.hora) at time zone v_tz end;
        v_paciente := v_paciente % array_length(v_pacientes, 1) + 1;

        insert into atta_in.appointment (id, tenant_id, person_id, professional_link_id, appointment_type, starts_at, ends_at)
        values (v_id, c.tenant, v_pacientes[v_paciente], case s.prof when 'a' then c.prof_a else c.prof_b end, s.tipo,
                v_inicio_ag, v_inicio_ag + interval '30 minutes')
        on conflict do nothing
        returning id into v_novo;
        continue when v_novo is null;
        v_n := v_n + 1;
        if s.com_servico then
          insert into atta_in.appointment_clinic_service (tenant_id, appointment_id, clinic_service_id)
          values (c.tenant, v_id, c.servico);
        end if;

        if s.estado in ('em_preenchimento', 'pronto', 'em_atendimento', 'concluido') then
          perform atta_in.apply_transition(v_id, c.tenant, 'em_preenchimento');
        end if;
        if s.estado in ('pronto', 'em_atendimento', 'concluido') then
          perform atta_in.apply_transition(v_id, c.tenant, 'pronto');
        end if;
        if s.estado in ('em_atendimento', 'concluido') then
          perform atta_in.apply_transition(v_id, c.tenant, 'em_atendimento');
        end if;
        if s.estado = 'concluido' then
          perform atta_in.apply_transition(v_id, c.tenant, 'concluido');
        elsif s.estado = 'ausente' then
          perform atta_in.apply_transition(v_id, c.tenant, 'ausente', null, false, 'manual');
        elsif s.estado = 'cancelado' then
          perform atta_in.apply_transition(v_id, c.tenant, 'cancelado', 'cancelado_pelo_paciente');
        end if;
      end loop;
    end loop;
  end loop;
  raise notice 'agenda: % agendamentos novos', v_n;
end $$;

commit;
