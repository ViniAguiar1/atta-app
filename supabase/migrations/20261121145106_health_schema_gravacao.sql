-- MIG-22 (parte 1): Formulário de Saúde, o schema health e a gravação pelo paciente. PDD v206 §10.3.2, §11.6, §11.7 e
-- §19.4; ADR 0001 (schema health FECHADO: fora da API e sem USAGE para anon e authenticated), ADR 0002 (cifra na
-- aplicação: cada resposta com DEK própria, envelopada por getCofre('health'); o banco nunca decifra), ADR 0003 (trilha
-- só com ids) e ADR 0004 (grant do paciente; nenhum id vem do navegador). Contrato da porta: desenho/mig-52 (TL, 21/11).
--
-- Dona própria: health_owner, sem login e sem BYPASSRLS (o postgres tem BYPASSRLS no Supabase, e aí a RLS forçada não
-- valeria). Tudo do schema health, e as funções que o tocam, nascem como ela (mesmo molde do audit_owner, MIG-04).
-- Ela não lê platform.access_grant (RLS forçada, sem policy para ela): o grant é resolvido por private.health_grant,
-- do dono, que só devolve o que é válido.
--
-- Nesta parte:
--   - health.question (Banco de Perguntas da ATTA, de rede), health.submission (um formulário por atendimento) e
--     health.answer (uma linha por pergunta, cifrada; "Prefiro não responder" é refused = true, sem valor);
--   - api.health_answer_save: salvamento contínuo por pergunta, só pelo grant patient_checkin do próprio paciente,
--     enquanto o formulário não foi declarado;
--   - private.can_read_health: a regra de QUEM LÊ, num lugar só. O próprio paciente (patient_checkin) e o profissional
--     DO ATENDIMENTO, pelo grant professional_boarding com sessão e sendo o profissional atual (CTO, S2 do #304).
--     Gestor e Colaborador nunca: não há caminho de login de staff. A "autorização do profissional" (PDD §19.4) segue
--     em aberto com a PO e, quando vier, muda só aqui.
-- As próximas partes: a definição do formulário da clínica, o carregar e o declarar (RN-FSA-12); e a leitura do Boarding
-- Check (MIG-23, Backend 6), que chama a função única de leitura.
-- Sempre para a frente.

create role health_owner nologin nobypassrls noinherit;
grant health_owner to postgres with inherit false, set true;
alter schema health owner to health_owner;
grant usage, create on schema private to health_owner;   -- private.can_read_health é dela
grant usage, create on schema api to health_owner;       -- as funções api.health_* são dela
-- a trilha é da audit_owner: só ela concede (o postgres, sem ser dona, só ganharia um aviso)
set role audit_owner;
grant usage on schema audit to health_owner;
grant execute on function audit.record_event(text, text, uuid, jsonb, jsonb, jsonb, uuid) to health_owner;
reset role;

-- ---------------------------------------------------------------------------------------------------------------
-- O grant, pelo hash, só se válido (dono: postgres, que lê platform.access_grant). Devolve nada se não vale.
-- ---------------------------------------------------------------------------------------------------------------
create function private.health_grant(p_secret_hash bytea, p_purpose text)
returns table (grant_id uuid, tenant_id uuid, person_id uuid, appointment_id uuid, professional_link_id uuid,
               session_started_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.tenant_id, g.person_id, g.appointment_id, g.professional_link_id, g.session_started_at
  from platform.access_grant g
  where p_secret_hash is not null and octet_length(p_secret_hash) = 32
    and g.secret_hash = p_secret_hash and g.purpose = p_purpose
    and private.grant_is_valid(g.id, p_purpose)
$$;
revoke all on function private.health_grant(bytea, text) from public, anon, authenticated, service_role;
grant execute on function private.health_grant(bytea, text) to health_owner;

-- o profissional ATUAL do atendimento (dono: postgres, que lê atta_in.appointment): a troca de profissional corta o
-- grant do anterior (CTO, S2 do #304)
create function private.health_appointment_professional(p_tenant_id uuid, p_appointment_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$ select a.professional_link_id from atta_in.appointment a where a.tenant_id = p_tenant_id and a.id = p_appointment_id $$;
revoke all on function private.health_appointment_professional(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function private.health_appointment_professional(uuid, uuid) to health_owner;

insert into audit.action (action, kind) values ('health.save', 'change'), ('health.read', 'access')
on conflict (action) do nothing;

-- Daqui até o `reset role`, tudo nasce como a dona.
set role health_owner;

create table health.question (
  id          uuid primary key default gen_random_uuid(),
  text        text not null check (char_length(btrim(text)) between 2 and 500),
  kind        text not null check (kind in ('sim_nao', 'opcoes', 'aberta')),   -- §10.3.2.1
  options     jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  allow_other boolean not null default false,
  sub_options jsonb check (sub_options is null or jsonb_typeof(sub_options) = 'object'),   -- RN-FSA-07
  created_at  timestamptz not null default now()
);

create table health.submission (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  person_id      uuid not null,
  appointment_id uuid not null,
  declared_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint submission_appointment_uq unique (tenant_id, appointment_id),
  constraint submission_tenant_id_uq unique (tenant_id, id)
);

create table health.answer (
  id            uuid primary key,   -- gerado no servidor ANTES de cifrar: entra na AAD (ADR 0002)
  tenant_id     uuid not null,
  submission_id uuid not null,
  question_id   uuid not null references health.question (id),
  refused       boolean not null default false,   -- "Prefiro não responder" (RN-FSA-10/12)
  value_enc     bytea,
  dek_wrapped   bytea,
  kek_version   smallint,
  saved_at      timestamptz not null default now(),
  constraint answer_submission_fk foreign key (tenant_id, submission_id) references health.submission (tenant_id, id),
  constraint answer_question_uq unique (submission_id, question_id),
  -- recusada não tem valor; respondida tem o valor cifrado no formato 1, a DEK e a versão da KEK
  constraint answer_value_check check (
    (refused and value_enc is null and dek_wrapped is null and kek_version is null)
    or (not refused and value_enc is not null and get_byte(value_enc, 0) = 1 and octet_length(value_enc) > 31
        and dek_wrapped is not null and kek_version between 1 and 32767))
);
create index answer_submission_idx on health.answer (tenant_id, submission_id);

do $$ declare t text; begin
  foreach t in array array['health.question', 'health.submission', 'health.answer'] loop
    execute format('alter table %s enable row level security', t);
    execute format('alter table %s force row level security', t);
  end loop;
end $$;
-- só a dona, e só pelo que as funções fazem: ler, inserir e regravar a resposta antes do "Declaro"
create policy owner_select_question on health.question for select to health_owner using (true);
-- o Banco de Perguntas é da ATTA: entra por migration ou seed, como a dona (nenhuma função o edita)
create policy owner_insert_question on health.question for insert to health_owner with check (true);
create policy owner_select_submission on health.submission for select to health_owner using (true);
create policy owner_insert_submission on health.submission for insert to health_owner with check (true);
create policy owner_update_submission on health.submission for update to health_owner using (true) with check (true);
create policy owner_select_answer on health.answer for select to health_owner using (true);
create policy owner_insert_answer on health.answer for insert to health_owner with check (true);
create policy owner_update_answer on health.answer for update to health_owner
  using ((select s.declared_at from health.submission s where s.tenant_id = answer.tenant_id and s.id = answer.submission_id) is null)
  with check (true);

-- ---------------------------------------------------------------------------------------------------------------
-- Quem lê, num lugar só. Recebe o grant já resolvido (e válido) e o envio; devolve se pode ler.
-- ---------------------------------------------------------------------------------------------------------------
create function private.can_read_health(p_purpose text, p_grant_person uuid, p_grant_appointment uuid,
                                        p_grant_professional_link uuid, p_session_started_at timestamptz,
                                        p_submission_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s health.submission;
begin
  select * into s from health.submission x where x.id = p_submission_id;
  if not found then
    return false;
  end if;
  if p_purpose = 'patient_checkin' then
    return p_grant_person = s.person_id and p_grant_appointment = s.appointment_id;
  end if;
  if p_purpose = 'professional_boarding' then
    return p_session_started_at is not null and p_grant_appointment = s.appointment_id
       and p_grant_professional_link = private.health_appointment_professional(s.tenant_id, s.appointment_id);
  end if;
  return false;   -- qualquer outro caminho, inclusive staff (Gestor e Colaborador nunca leem)
end;
$$;
revoke all on function private.can_read_health(text, uuid, uuid, uuid, timestamptz, uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Gravar uma resposta (salvamento contínuo, §11.5 e §26.2). O servidor cifra antes (getCofre('health'), DEK por
-- resposta, AAD (tenant, 'health.answer', 'value', p_answer_id)); aqui só o cifrado. Regravar a mesma pergunta troca a
-- linha inteira (id novo, DEK nova). Depois do "Declaro", nada muda.
-- ---------------------------------------------------------------------------------------------------------------
create function api.health_answer_save(p_grant_secret_hash bytea, p_answer_id uuid, p_question_id uuid, p_refused boolean,
                                       p_value_enc bytea, p_dek_wrapped bytea, p_kek_version smallint)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  g record;
  v_submission health.submission;
begin
  select * into g from private.health_grant(p_grant_secret_hash, 'patient_checkin');
  if g.grant_id is null then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004', detail = 'grant';
  end if;
  if p_answer_id is null or p_refused is null
     or not exists (select 1 from health.question q where q.id = p_question_id) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'question_id';
  end if;
  insert into health.submission (tenant_id, person_id, appointment_id)
  values (g.tenant_id, g.person_id, g.appointment_id)
  on conflict (tenant_id, appointment_id) do nothing;
  select * into v_submission from health.submission s
  where s.tenant_id = g.tenant_id and s.appointment_id = g.appointment_id for update;
  if v_submission.person_id <> g.person_id then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004', detail = 'grant';
  end if;
  if v_submission.declared_at is not null then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0002', detail = 'declared';
  end if;
  begin
    insert into health.answer (id, tenant_id, submission_id, question_id, refused, value_enc, dek_wrapped, kek_version)
    values (p_answer_id, g.tenant_id, v_submission.id, p_question_id, p_refused,
            case when p_refused then null else p_value_enc end, case when p_refused then null else p_dek_wrapped end,
            case when p_refused then null else p_kek_version end)
    on conflict (submission_id, question_id) do update
      set id = excluded.id, refused = excluded.refused, value_enc = excluded.value_enc, dek_wrapped = excluded.dek_wrapped,
          kek_version = excluded.kek_version, saved_at = now();
  exception when check_violation or unique_violation then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'value';
  end;
  update health.submission s set updated_at = now() where s.id = v_submission.id;
  -- só o fato e ids: a resposta não entra na trilha, nem cifrada (ADR 0003)
  perform audit.record_event('health.save', 'health.submission', v_submission.id, '{}'::jsonb, null, null, g.tenant_id);
  return pg_catalog.to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
end;
$$;
revoke all on function api.health_answer_save(bytea, uuid, uuid, boolean, bytea, bytea, smallint) from public, anon, authenticated;
grant execute on function api.health_answer_save(bytea, uuid, uuid, boolean, bytea, bytea, smallint) to service_role;

reset role;

revoke all on schema health from public, anon, authenticated, service_role;
