-- MIG-22 (parte 1): schema health fechado, gravação pelo paciente e quem lê. PDD v206 §10.3.2, §11.6 e §19.4; ADR 0001,
-- 0002, 0003 e 0004. Gestor e Colaborador nunca leem. Só dado fictício (bytes inventados, nada de resposta real).
begin;
select plan(25);

insert into platform.tenant (id, name) values ('00000000-0000-4000-8000-0000000022a1', 'Clínica Fictícia Saúde');
insert into network.person (id, full_name, is_incomplete) values
  ('00000000-0000-4000-8000-0000000022e1', 'Paciente Fictícia Saúde', true),
  ('00000000-0000-4000-8000-0000000022e2', 'Outro Paciente Fictício', true);
insert into network.person_tenant_link (tenant_id, person_id) values
  ('00000000-0000-4000-8000-0000000022a1', '00000000-0000-4000-8000-0000000022e1');
insert into platform.professional (id, display_name, council, council_uf, council_number, cpf_hmac, cpf_masked, cpf_enc,
                                   email_enc, dek_wrapped, kek_version, council_status, council_verified_at) values
  ('00000000-0000-4000-8000-0000000022f1', 'Dra. Fictícia Saúde', 'cro', 'SP', '22221', sha256('cpf-s1'::bytea), '···.···.000-21', '\x01', '\x01', '\x01', 1, 'regularizado', now()),
  ('00000000-0000-4000-8000-0000000022f2', 'Dr. Fictício Substituto', 'cro', 'SP', '22222', sha256('cpf-s2'::bytea), '···.···.000-22', '\x01', '\x01', '\x01', 1, 'regularizado', now());
insert into platform.professional_tenant_link (id, tenant_id, professional_id, invite_email_hmac, invite_email_enc,
                                               envelope_id, dek_wrapped, kek_version, propass_completed_at,
                                               privacy_notice_version, privacy_notice_ack_at) values
  ('00000000-0000-4000-8000-0000000022d1', '00000000-0000-4000-8000-0000000022a1', '00000000-0000-4000-8000-0000000022f1',
   sha256('s1@a.test'::bytea), '\x01', gen_random_uuid(), '\x01', 1, now(), 'v1', now()),
  ('00000000-0000-4000-8000-0000000022d2', '00000000-0000-4000-8000-0000000022a1', '00000000-0000-4000-8000-0000000022f2',
   sha256('s2@a.test'::bytea), '\x01', gen_random_uuid(), '\x01', 1, now(), 'v1', now());
insert into atta_in.appointment (id, tenant_id, person_id, professional_link_id, appointment_type, starts_at, ends_at)
values ('00000000-0000-4000-8000-0000000022c1', '00000000-0000-4000-8000-0000000022a1', '00000000-0000-4000-8000-0000000022e1',
        '00000000-0000-4000-8000-0000000022d1', 'consulta', now() + interval '1 day', now() + interval '1 day 1 hour');
insert into platform.access_grant (purpose, tenant_id, person_id, appointment_id, secret_hash, expires_at) values
  ('patient_checkin', '00000000-0000-4000-8000-0000000022a1', '00000000-0000-4000-8000-0000000022e1',
   '00000000-0000-4000-8000-0000000022c1', sha256('paciente-saude'::bytea), now() + interval '1 hour');
-- o postgres não lê nem grava health (é isso que fecha o schema): os dados de teste e as leituras vão como a dona
set local role health_owner;
insert into health.question (id, text, kind) values
  ('00000000-0000-4000-8000-0000000022b1', 'Pergunta fictícia A?', 'sim_nao'),
  ('00000000-0000-4000-8000-0000000022b2', 'Pergunta fictícia B?', 'aberta');
reset role;

create function pg_temp.salvar(p_answer uuid, p_question uuid, p_refused boolean, p_value bytea default null,
                               p_secret text default 'paciente-saude') returns text language sql as $$
  select api.health_answer_save(sha256(p_secret::bytea), p_answer, p_question, p_refused, p_value,
                                case when p_value is null then null else '\x01aa'::bytea end,
                                case when p_value is null then null else 1::smallint end)
$$;
create function pg_temp.cifra() returns bytea language sql as $$ select '\x01'::bytea || sha512('cifra-ficticia'::bytea) $$;
create function pg_temp.detalhe(p_sql text) returns text language plpgsql as $$
declare d text; m text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics d = pg_exception_detail, m = message_text;
  return m || ':' || d;
end $$;

-- portão fixo (não muda com a regra da PO) ---------------------------------------------------------------------------
select ok((select not rolbypassrls and not rolcanlogin from pg_roles where rolname = 'health_owner'),
          'health_owner: sem login e sem BYPASSRLS (a RLS forçada vale de verdade)');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'health' and c.relkind = 'r'
             and pg_get_userbyid(c.relowner) = 'health_owner' and c.relrowsecurity and c.relforcerowsecurity), 3,
          'as 3 tabelas de health são da dona, com RLS forçada');
select ok(not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                      cross join unnest(array['anon', 'authenticated', 'service_role']) r
                      where n.nspname = 'health' and c.relkind = 'r'
                        and (has_table_privilege(r, c.oid, 'select') or has_table_privilege(r, c.oid, 'insert'))),
          'anon, authenticated e service_role não leem nem gravam nenhuma tabela de health');
select ok(not has_schema_privilege('authenticated', 'health', 'usage') and not has_schema_privilege('anon', 'health', 'usage'),
          'schema health fechado (sem USAGE para anon e authenticated)');
select ok(has_function_privilege('service_role', 'api.health_answer_save(bytea, uuid, uuid, boolean, bytea, bytea, smallint)', 'execute')
          and not has_function_privilege('authenticated', 'api.health_answer_save(bytea, uuid, uuid, boolean, bytea, bytea, smallint)', 'execute'),
          'gravação só pelo servidor (service_role); nada para login de staff');
select ok(not has_function_privilege('authenticated', 'private.can_read_health(text, uuid, uuid, uuid, timestamptz, uuid)', 'execute')
          and not has_function_privilege('service_role', 'private.can_read_health(text, uuid, uuid, uuid, timestamptz, uuid)', 'execute')
          and not has_function_privilege('service_role', 'private.health_grant(bytea, text)', 'execute'),
          'a regra e o grant não têm EXECUTE para os papéis da API');
select is((select count(*)::int from pg_proc where proname in ('can_read_health', 'health_answer_save')
           and pg_get_userbyid(proowner) = 'health_owner' and prosecdef), 2,
          'as funções que tocam health são SECURITY DEFINER da dona (nunca do postgres)');

-- gravação -----------------------------------------------------------------------------------------------------------
select isnt(pg_temp.salvar('00000000-0000-4000-8000-0000000022a9', '00000000-0000-4000-8000-0000000022b1', false, pg_temp.cifra()),
            null, 'o paciente grava a resposta cifrada pelo grant do check-in');
-- o pgTAP não fica visível para a dona: como ela, só se guarda o valor; a asserção vem depois, como postgres
set local role health_owner;
select set_config('teste.sub', (select string_agg(person_id::text || '|' || appointment_id::text || '|' || (declared_at is null)::text, ',')
                                from health.submission), true);
select set_config('teste.cif', (select (get_byte(value_enc, 0) = 1 and not refused)::text from health.answer where question_id = '00000000-0000-4000-8000-0000000022b1'), true);
reset role;
select is(current_setting('teste.sub'), '00000000-0000-4000-8000-0000000022e1|00000000-0000-4000-8000-0000000022c1|true',
          'um formulário por atendimento, da pessoa do grant (os ids vêm do grant, nunca do navegador)');
select is(current_setting('teste.cif'), 'true', 'o banco guarda só o cifrado (formato 1)');
select pg_temp.salvar('00000000-0000-4000-8000-0000000022a8', '00000000-0000-4000-8000-0000000022b2', true, pg_temp.cifra());
set local role health_owner;
select set_config('teste.rec', (select (refused and value_enc is null and dek_wrapped is null)::text from health.answer where question_id = '00000000-0000-4000-8000-0000000022b2'), true);
reset role;
select is(current_setting('teste.rec'), 'true', '"Prefiro não responder": recusada, sem valor (mesmo que venha um)');
select is(pg_temp.detalhe($$ select pg_temp.salvar('00000000-0000-4000-8000-0000000022a7', '00000000-0000-4000-8000-0000000022b1', false) $$),
          'ATTA-IN-0001:value', 'respondida sem valor é recusada');
select is(pg_temp.detalhe($$ select pg_temp.salvar('00000000-0000-4000-8000-0000000022a7', '00000000-0000-4000-8000-0000000022b1', false, '\x02aaaa'::bytea) $$),
          'ATTA-IN-0001:value', 'valor fora do formato 1 é recusado');
select pg_temp.salvar('00000000-0000-4000-8000-0000000022a6', '00000000-0000-4000-8000-0000000022b1', false, pg_temp.cifra());
set local role health_owner;
select set_config('teste.ids', (select string_agg(id::text, ',') from health.answer where question_id = '00000000-0000-4000-8000-0000000022b1'), true);
reset role;
select is(current_setting('teste.ids'), '00000000-0000-4000-8000-0000000022a6',
          'regravar a mesma pergunta troca a linha inteira (id novo, DEK nova)');
select ok((select count(*) = 3 and bool_and(details = '{}'::jsonb and before is null and after is null)
           from audit.event where action = 'health.save' and tenant_id = '00000000-0000-4000-8000-0000000022a1'),
          'cada gravação vai à trilha só com o fato e ids, sem resposta nem cifrado');
select is(pg_temp.detalhe($$ select pg_temp.salvar(gen_random_uuid(), gen_random_uuid(), true) $$),
          'ATTA-IN-0001:question_id', 'pergunta desconhecida é recusada');
select is(pg_temp.detalhe($$ select pg_temp.salvar(gen_random_uuid(), '00000000-0000-4000-8000-0000000022b1', true, null, 'outro-segredo') $$),
          'ATTA-AUTH-0004:grant', 'sem grant válido, nada se grava (sem dizer por quê)');
update platform.access_grant set revoked_at = now() where secret_hash = sha256('paciente-saude'::bytea);
select is(pg_temp.detalhe($$ select pg_temp.salvar(gen_random_uuid(), '00000000-0000-4000-8000-0000000022b1', true) $$),
          'ATTA-AUTH-0004:grant', 'grant revogado não grava');
update platform.access_grant set revoked_at = null where secret_hash = sha256('paciente-saude'::bytea);
set local role health_owner;
update health.submission set declared_at = now();
reset role;
select is(pg_temp.detalhe($$ select pg_temp.salvar(gen_random_uuid(), '00000000-0000-4000-8000-0000000022b1', true) $$),
          'ATTA-IN-0002:declared', 'depois do "Declaro", nada muda');

-- quem lê (private.can_read_health) ------------------------------------------------------------------------------------
set local role health_owner;
select set_config('teste.pode', concat_ws(',',
  private.can_read_health('patient_checkin', '00000000-0000-4000-8000-0000000022e1', '00000000-0000-4000-8000-0000000022c1', null, null, (select id from health.submission)),
  private.can_read_health('patient_checkin', '00000000-0000-4000-8000-0000000022e2', '00000000-0000-4000-8000-0000000022c1', null, null, (select id from health.submission)),
  private.can_read_health('professional_boarding', null, '00000000-0000-4000-8000-0000000022c1', '00000000-0000-4000-8000-0000000022d1', now(), (select id from health.submission)),
  private.can_read_health('professional_boarding', null, '00000000-0000-4000-8000-0000000022c1', '00000000-0000-4000-8000-0000000022d1', null, (select id from health.submission))), true);
reset role;
select is(split_part(current_setting('teste.pode'), ',', 1), 't', 'o próprio paciente lê o seu formulário');
select is(split_part(current_setting('teste.pode'), ',', 2), 'f', 'outra pessoa não lê');
select is(split_part(current_setting('teste.pode'), ',', 3), 't', 'o profissional do atendimento, com sessão (PIN certo), lê');
select is(split_part(current_setting('teste.pode'), ',', 4), 'f', 'sem sessão (antes do PIN), não lê');
update atta_in.appointment set professional_link_id = '00000000-0000-4000-8000-0000000022d2' where id = '00000000-0000-4000-8000-0000000022c1';
set local role health_owner;
select set_config('teste.troca', concat_ws(',',
  private.can_read_health('professional_boarding', null, '00000000-0000-4000-8000-0000000022c1', '00000000-0000-4000-8000-0000000022d1', now(), (select id from health.submission)),
  private.can_read_health('staff', null, '00000000-0000-4000-8000-0000000022c1', null, now(), (select id from health.submission)),
  private.can_read_health('professional_propass', null, '00000000-0000-4000-8000-0000000022c1', '00000000-0000-4000-8000-0000000022d2', now(), (select id from health.submission))), true);
reset role;
select is(split_part(current_setting('teste.troca'), ',', 1), 'f', 'trocado o profissional, o anterior não lê mais (CTO, S2 do #304)');
select is(split_part(current_setting('teste.troca'), ',', 2) || split_part(current_setting('teste.troca'), ',', 3), 'ff',
          'qualquer outro caminho (staff, PROpass) não lê: Gestor e Colaborador nunca');

select * from finish();
rollback;
