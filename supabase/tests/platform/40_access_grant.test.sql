-- MIG-13a: grant de sessão (ADR 0004 §3). Dados fictícios: hashes de texto inventado, ids inventados.
begin;
select plan(33);

insert into platform.tenant (id, name) values
  ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A'),
  ('00000000-0000-4000-8000-00000000000b', 'Clínica Fictícia B');
insert into network.person (id, full_name, is_incomplete)
values ('00000000-0000-4000-8000-0000000000e1', 'Paciente Fictício', true);
-- vínculo fictício do profissional com a clínica A (nasce no convite)
insert into platform.professional_tenant_link (id, tenant_id, invite_email_hmac, invite_email_enc, envelope_id,
                                               dek_wrapped, kek_version)
values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000000a', sha256('dra@a.test'::bytea),
        '\x01', gen_random_uuid(), '\x01', 1);

-- relógio: envelhece o grant (como postgres), para testar inatividade e teto sem esperar
create function pg_temp.envelhecer(p_hash bytea, p_criado interval, p_uso interval) returns void
language sql security definer as $$
  update platform.access_grant set created_at = now() - p_criado, last_used_at = now() - p_uso,
                                   sent_at = case when sent_at is not null then now() - p_criado end,
                                   expires_at = now() - p_criado + (select ceiling from private.grant_policy(purpose))
  where secret_hash = p_hash
$$;
create function pg_temp.eventos(p_action text) returns int language sql security definer as $$
  select count(*)::int from audit.event where action = p_action and tenant_id = '00000000-0000-4000-8000-00000000000a'
$$;
create function pg_temp.id_do(p_hash bytea) returns uuid language sql security definer as $$
  select id from platform.access_grant where secret_hash = p_hash
$$;
create function pg_temp.ultimo_uso(p_hash bytea) returns timestamptz language sql security definer as $$
  select last_used_at from platform.access_grant where secret_hash = p_hash
$$;
do $$ begin
  execute format('grant execute on all functions in schema %I to service_role', pg_my_temp_schema()::regnamespace);
end $$;

-- fechado: tabela sem grant para ninguém da Data API; funções só para o service_role
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'platform.access_grant'::regclass),
          'access_grant com RLS forçada');
select ok(not has_table_privilege('authenticated', 'platform.access_grant', 'SELECT')
          and not has_table_privilege('anon', 'platform.access_grant', 'SELECT')
          and not has_table_privilege('service_role', 'platform.access_grant', 'SELECT'),
          'ninguém lê a tabela direto, nem o service_role');
select ok(not has_function_privilege('anon', 'api.grant_issue(text, bytea, uuid, uuid, uuid, uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'api.grant_issue(text, bytea, uuid, uuid, uuid, uuid)', 'EXECUTE'),
          'anon e authenticated sem EXECUTE em grant_issue');
select ok(not has_function_privilege('anon', 'api.grant_resolve(bytea, text)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'api.grant_resolve(bytea, text)', 'EXECUTE'),
          'anon e authenticated sem EXECUTE em grant_resolve');
select ok(not has_function_privilege('anon', 'api.grant_revoke(bytea)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'api.grant_revoke(bytea)', 'EXECUTE'),
          'anon e authenticated sem EXECUTE em grant_revoke');
select ok(has_function_privilege('service_role', 'api.grant_resolve(bytea, text)', 'EXECUTE'), 'service_role resolve');
select ok(not has_function_privilege('anon', 'api.grant_mark_sent(uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'api.grant_mark_sent(uuid)', 'EXECUTE'),
          'anon e authenticated sem EXECUTE em grant_mark_sent');
select ok(not has_function_privilege('authenticated', 'private.grant_is_valid(uuid, text)', 'EXECUTE'),
          'authenticated sem EXECUTE na regra de validade');
select is((select count(*)::int from information_schema.parameters
           where specific_schema = 'api' and specific_name like 'grant_resolve%'
             and parameter_name in ('p_tenant_id', 'p_person_id', 'p_appointment_id')), 0,
          'grant_resolve não recebe tenant, pessoa nem atendimento: vêm do grant');

-- o servidor (service_role) emite e resolve
set local role service_role;
select ok((select api.grant_issue('patient_checkin', sha256('segredo-p1'::bytea), '00000000-0000-4000-8000-00000000000a',
                                  '00000000-0000-4000-8000-0000000000d1', p_person_id => '00000000-0000-4000-8000-0000000000e1')
           is not null), 'grant do paciente emitido');
select results_eq($$ select tenant_id, person_id, appointment_id from api.grant_resolve(sha256('segredo-p1'::bytea), 'patient_checkin') $$,
                  $$ values ('00000000-0000-4000-8000-00000000000a'::uuid, '00000000-0000-4000-8000-0000000000e1'::uuid,
                            '00000000-0000-4000-8000-0000000000d1'::uuid) $$,
                  'resolve devolve só o contexto do grant (clínica A, a pessoa e o atendimento)');
select ok(pg_temp.ultimo_uso(sha256('segredo-p1'::bytea)) is not null, 'cada uso renova a validade');
select throws_ok($$ select * from api.grant_resolve(sha256('segredo-p1'::bytea), 'professional_boarding') $$,
                 '42501', 'ATTA-AUTH-0004', 'grant de finalidade errada é recusado');
select throws_ok($$ select * from api.grant_resolve(sha256('segredo-que-nao-existe'::bytea), 'patient_checkin') $$,
                 '42501', 'ATTA-AUTH-0004', 'segredo desconhecido é recusado do mesmo jeito');
select throws_ok($$ select api.grant_issue('patient_checkin', sha256('segredo-p1'::bytea), '00000000-0000-4000-8000-00000000000b',
                    '00000000-0000-4000-8000-0000000000d9', p_person_id => '00000000-0000-4000-8000-0000000000e1') $$,
                 '23505', null, 'o mesmo segredo não vale para outra clínica');
select throws_ok($$ select api.grant_issue('patient_checkin', sha256('segredo-p2'::bytea), '00000000-0000-4000-8000-00000000000a',
                    '00000000-0000-4000-8000-0000000000d1', p_professional_link_id => '00000000-0000-4000-8000-0000000000c1') $$,
                 '23514', null, 'grant do paciente exige a pessoa, e só ela');
select throws_ok($$ select api.grant_issue('professional_boarding', sha256('segredo-b9'::bytea),
                    '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000d9',
                    p_professional_link_id => '00000000-0000-4000-8000-0000000000c1') $$,
                 '23503', null, 'grant do profissional só com o vínculo da mesma clínica (FK)');
select throws_ok($$ select api.grant_issue('outra_coisa', sha256('segredo-p3'::bytea), '00000000-0000-4000-8000-00000000000a',
                    '00000000-0000-4000-8000-0000000000d1', p_person_id => '00000000-0000-4000-8000-0000000000e1') $$,
                 'P0001', 'ATTA-IN-0001', 'finalidade fora da lista é recusada');
select throws_ok($$ select api.grant_issue('patient_checkin', '\x0102', '00000000-0000-4000-8000-00000000000a',
                    '00000000-0000-4000-8000-0000000000d1', p_person_id => '00000000-0000-4000-8000-0000000000e1') $$,
                 'P0001', 'ATTA-IN-0001', 'segredo que não é sha256 é recusado');

-- validade do paciente: 30 min sem uso, teto de 2 h
select pg_temp.envelhecer(sha256('segredo-p1'::bytea), interval '1 hour', interval '29 minutes');
select lives_ok($$ select * from api.grant_resolve(sha256('segredo-p1'::bytea), 'patient_checkin') $$,
                'paciente: 29 min sem uso ainda vale');
select pg_temp.envelhecer(sha256('segredo-p1'::bytea), interval '1 hour', interval '31 minutes');
select throws_ok($$ select * from api.grant_resolve(sha256('segredo-p1'::bytea), 'patient_checkin') $$,
                 '42501', 'ATTA-AUTH-0004', 'paciente: 31 min sem uso vence');
select pg_temp.envelhecer(sha256('segredo-p1'::bytea), interval '2 hours 1 minute', interval '1 minute');
select throws_ok($$ select * from api.grant_resolve(sha256('segredo-p1'::bytea), 'patient_checkin') $$,
                 '42501', 'ATTA-AUTH-0004', 'paciente: passou do teto de 2 h, vence mesmo em uso');

-- revogação
select api.grant_issue('patient_checkin', sha256('segredo-p4'::bytea), '00000000-0000-4000-8000-00000000000a',
                       '00000000-0000-4000-8000-0000000000d1', p_person_id => '00000000-0000-4000-8000-0000000000e1');
select lives_ok($$ select api.grant_revoke(sha256('segredo-p4'::bytea)) $$, 'revoga o grant');
select throws_ok($$ select * from api.grant_resolve(sha256('segredo-p4'::bytea), 'patient_checkin') $$,
                 '42501', 'ATTA-AUTH-0004', 'grant revogado é recusado');
select lives_ok($$ select api.grant_revoke(sha256('segredo-desconhecido'::bytea)) $$,
                'revogar segredo desconhecido não dá erro (sem oráculo)');

-- profissional: só depois do envio do link, e até 8 h dele (PDD RN-FIC-07)
select api.grant_issue('professional_boarding', sha256('segredo-b1'::bytea), '00000000-0000-4000-8000-00000000000a',
                       '00000000-0000-4000-8000-0000000000d1', p_professional_link_id => '00000000-0000-4000-8000-0000000000c1');
select throws_ok($$ select * from api.grant_resolve(sha256('segredo-b1'::bytea), 'professional_boarding') $$,
                 '42501', 'ATTA-AUTH-0004', 'profissional: antes de a fila confirmar o envio, o link não vale');
select lives_ok($$ select api.grant_mark_sent(pg_temp.id_do(sha256('segredo-b1'::bytea))) $$, 'a fila confirma o envio');
select throws_ok($$ select api.grant_mark_sent(pg_temp.id_do(sha256('segredo-b1'::bytea))) $$,
                 'P0001', 'ATTA-IN-0001', 'o envio só se marca uma vez');
select pg_temp.envelhecer(sha256('segredo-b1'::bytea), interval '7 hours 59 minutes', interval '5 hours');
select lives_ok($$ select * from api.grant_resolve(sha256('segredo-b1'::bytea), 'professional_boarding') $$,
                'profissional: 7 h 59 depois do envio ainda vale (sem limite de inatividade)');
select pg_temp.envelhecer(sha256('segredo-b1'::bytea), interval '8 hours 1 minute', interval '1 minute');
select throws_ok($$ select * from api.grant_resolve(sha256('segredo-b1'::bytea), 'professional_boarding') $$,
                 '42501', 'ATTA-AUTH-0004', 'profissional: passou de 8 h do envio, vence (RN-FIC-07)');
select throws_ok($$ select api.grant_mark_sent(pg_temp.id_do(sha256('segredo-p1'::bytea))) $$,
                 'P0001', 'ATTA-IN-0001', 'grant do paciente não tem envio a marcar');

-- auditoria com o tenant explícito (o service_role não tem JWT)
select ok(pg_temp.eventos('grant.issue') = 3, 'cada emissão vai para audit, com a clínica');
select ok(pg_temp.eventos('grant.revoke') = 1, 'a revogação vai para audit');
reset role;

select * from finish();
rollback;
