-- MIG-23 (parte 1): PIN do Boarding Check (PDD RN-FIC-07, §10.2.3, §13.4; PLANO; ADR 0004 §3). Só dado fictício:
-- hashes de texto inventado, ids inventados, macs de texto inventado (o banco nunca vê o PIN).
begin;
select plan(38);

insert into platform.tenant (id, name) values ('00000000-0000-4000-8000-0000000023a0', 'Clínica Fictícia Boarding');
insert into platform.professional (id, display_name, council, council_uf, council_number, cpf_hmac, cpf_masked, cpf_enc,
                                   email_enc, dek_wrapped, kek_version) values
  ('00000000-0000-4000-8000-0000000023f1', 'Dra. Fictícia PIN', 'cro', 'SP', '23001', sha256('cpf-23f1'::bytea),
   '···.···.000-01', '\x01', '\x01', '\x01', 1),
  ('00000000-0000-4000-8000-0000000023f2', 'Dr. Fictício Sem PIN', 'cro', 'SP', '23002', sha256('cpf-23f2'::bytea),
   '···.···.000-02', '\x01', '\x01', '\x01', 1);
insert into platform.professional_tenant_link (id, tenant_id, professional_id, invite_email_hmac, invite_email_enc,
                                               envelope_id, dek_wrapped, kek_version, propass_completed_at) values
  ('00000000-0000-4000-8000-0000000023d1', '00000000-0000-4000-8000-0000000023a0', '00000000-0000-4000-8000-0000000023f1',
   sha256('dra-pin@a.test'::bytea), '\x01', gen_random_uuid(), '\x01', 1, now()),
  ('00000000-0000-4000-8000-0000000023d2', '00000000-0000-4000-8000-0000000023a0', '00000000-0000-4000-8000-0000000023f2',
   sha256('dr-sem-pin@a.test'::bytea), '\x01', gen_random_uuid(), '\x01', 1, now());
-- o PIN da Dra. Fictícia: o servidor mandaria o HMAC; aqui, o sha256 de um texto inventado faz o papel
insert into platform.professional_pin (professional_id, pin_mac, pin_mac_version)
values ('00000000-0000-4000-8000-0000000023f1', sha256('mac-certo'::bytea), 1);

-- link do Boarding Check já enviado pelo WhatsApp (sent_at), preso a um atendimento fictício
create function pg_temp.link(p_segredo text, p_vinculo uuid default '00000000-0000-4000-8000-0000000023d1',
                             p_enviado interval default interval '1 minute') returns void
language sql as $$
  insert into platform.access_grant (purpose, tenant_id, professional_link_id, appointment_id, secret_hash, expires_at,
                                     sent_at)
  values ('professional_boarding', '00000000-0000-4000-8000-0000000023a0', p_vinculo, gen_random_uuid(),
          sha256(p_segredo::bytea), now() + interval '8 hours', now() - p_enviado)
$$;
create function pg_temp.pin(p_segredo text, p_mac text, p_sessao text default 'sessao-x') returns text
language sql as $$
  select concat_ws(':', status, (locked_until is not null)::text)
  from api.boarding_confirm_pin(sha256(p_segredo::bytea), sha256(p_mac::bytea), sha256(p_sessao::bytea))
$$;
create function pg_temp.grant_de(p_segredo text) returns platform.access_grant language sql as $$
  select g from platform.access_grant g where g.secret_hash = sha256(p_segredo::bytea)
$$;
create function pg_temp.eventos(p_action text, p_reason text default null) returns int language sql as $$
  select count(*)::int from audit.event
  where action = p_action and tenant_id = '00000000-0000-4000-8000-0000000023a0'
    and (p_reason is null or details ->> 'reason' = p_reason)
$$;
do $$ begin
  execute format('grant execute on all functions in schema %I to service_role', pg_my_temp_schema()::regnamespace);
end $$;

select pg_temp.link('link-1');
select pg_temp.link('link-2');
select pg_temp.link('link-sem-pin', '00000000-0000-4000-8000-0000000023d2');
select pg_temp.link('link-vencido', p_enviado => interval '8 hours 1 minute');
select pg_temp.link('link-revogado');
update platform.access_grant set revoked_at = now() where secret_hash = sha256('link-revogado'::bytea);
insert into platform.access_grant (purpose, tenant_id, professional_link_id, appointment_id, secret_hash, expires_at)
values ('professional_boarding', '00000000-0000-4000-8000-0000000023a0', '00000000-0000-4000-8000-0000000023d1',
        gen_random_uuid(), sha256('link-nao-enviado'::bytea), now() + interval '8 hours');

-- fechado: só o service_role
select ok(not has_function_privilege('anon', 'api.boarding_confirm_pin(bytea, bytea, bytea)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'api.boarding_confirm_pin(bytea, bytea, bytea)', 'EXECUTE'),
          'anon e authenticated sem EXECUTE em boarding_confirm_pin');
select ok(not has_function_privilege('anon', 'api.boarding_pin_subject(bytea)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'api.boarding_pin_subject(bytea)', 'EXECUTE'),
          'anon e authenticated sem EXECUTE em boarding_pin_subject');
select ok(has_function_privilege('service_role', 'api.boarding_confirm_pin(bytea, bytea, bytea)', 'EXECUTE')
          and has_function_privilege('service_role', 'api.boarding_pin_subject(bytea)', 'EXECUTE'),
          'service_role executa as duas');
select is((select count(*)::int from information_schema.parameters
           where specific_schema = 'api' and (specific_name like 'boarding_confirm_pin%' or specific_name like 'boarding_pin_subject%')
             and parameter_name in ('p_tenant_id', 'p_professional_id', 'p_appointment_id', 'p_pin')), 0,
          'nenhum id nem o PIN vêm de fora: só hashes e o mac');
select throws_ok($$ insert into platform.access_grant (purpose, tenant_id, person_id, appointment_id, secret_hash, expires_at,
                                                       pin_failures_total)
                    values ('patient_checkin', '00000000-0000-4000-8000-0000000023a0', gen_random_uuid(), gen_random_uuid(),
                            sha256('outro'::bytea), now() + interval '1 hour', 1) $$,
                 '23514', null, 'tentativa de PIN só existe no Boarding Check');

set local role service_role;
-- o profissional do link (para o servidor calcular o mac)
select is(api.boarding_pin_subject(sha256('link-1'::bytea)), '00000000-0000-4000-8000-0000000023f1'::uuid,
          'link válido: o profissional do vínculo');
select is(api.boarding_pin_subject(sha256('link-desconhecido'::bytea)), null, 'link desconhecido: nada');
select is(api.boarding_pin_subject(sha256('link-vencido'::bytea)), null, 'link de mais de 8 h do envio: nada');
select is(api.boarding_pin_subject(sha256('link-nao-enviado'::bytea)), null, 'link ainda não enviado: nada');
select is(api.boarding_pin_subject(sha256('link-revogado'::bytea)), null, 'link revogado: nada');
select is(api.boarding_pin_subject('\x01'::bytea), null, 'hash fora do tamanho: nada');

-- entradas fora do formato
select throws_ok($$ select * from api.boarding_confirm_pin(sha256('link-1'::bytea), '\x01'::bytea, sha256('s'::bytea)) $$,
                 'P0001', 'ATTA-IN-0001', 'mac fora do tamanho é recusado');
select throws_ok($$ select * from api.boarding_confirm_pin(sha256('link-1'::bytea), sha256('m'::bytea), sha256('link-1'::bytea)) $$,
                 'P0001', 'ATTA-IN-0001', 'sessão igual ao link é recusada');

-- sem oráculo: desconhecido, vencido, revogado e não enviado respondem igual
select is(pg_temp.pin('link-desconhecido', 'mac-certo'), 'indisponivel:false', 'link desconhecido: indisponível');
select is(pg_temp.pin('link-vencido', 'mac-certo'), 'indisponivel:false', 'link vencido: indisponível, mesmo com o PIN certo');
select is(pg_temp.pin('link-revogado', 'mac-certo'), 'indisponivel:false', 'link revogado: indisponível');
select is(pg_temp.pin('link-nao-enviado', 'mac-certo'), 'indisponivel:false', 'link não enviado: indisponível');

-- 4 erros: PIN incorreto; o 5º seguido bloqueia por 15 minutos
select is(pg_temp.pin('link-1', 'mac-errado') || pg_temp.pin('link-1', 'mac-errado') || pg_temp.pin('link-1', 'mac-errado')
          || pg_temp.pin('link-1', 'mac-errado'), repeat('pin_incorreto:false', 4), 'do 1º ao 4º erro: PIN incorreto');
select is(pg_temp.pin('link-1', 'mac-errado'), 'bloqueado:true', '5º erro seguido: bloqueado, com a hora');
select is(pg_temp.pin('link-1', 'mac-certo'), 'bloqueado:true', 'bloqueado: nem o PIN certo entra');
reset role;
select ok((select pin_locked_until between now() + interval '14 minutes' and now() + interval '15 minutes'
                  and pin_failures_total = 5 and pin_failures_streak = 0 from pg_temp.grant_de('link-1')),
          '15 minutos de bloqueio; a tentativa bloqueada não conta; a sequência zera');
select is(pg_temp.eventos('boarding.pin_fail', 'locked'), 1, 'a tentativa durante o bloqueio vai para a trilha');

-- passado o bloqueio: mais 5 erros = 10 no total, e o link é revogado
update platform.access_grant set pin_locked_until = now() - interval '1 second' where secret_hash = sha256('link-1'::bytea);
set local role service_role;
select is(pg_temp.pin('link-1', 'mac-errado') || pg_temp.pin('link-1', 'mac-errado') || pg_temp.pin('link-1', 'mac-errado')
          || pg_temp.pin('link-1', 'mac-errado'), repeat('pin_incorreto:false', 4), 'depois do bloqueio: do 6º ao 9º erro');
select is(pg_temp.pin('link-1', 'mac-errado'), 'indisponivel:false', '10º erro no total: o link é revogado');
select is(pg_temp.pin('link-1', 'mac-certo'), 'indisponivel:false', 'revogado: nem o PIN certo abre');
reset role;
select ok((select revoked_at is not null and pin_failures_total = 10 from pg_temp.grant_de('link-1')),
          'revoked_at gravado com 10 erros');
select is(pg_temp.eventos('grant.revoke', 'pin_attempts'), 1, 'a revogação vai para a trilha, com o motivo');
select is(pg_temp.eventos('boarding.pin_fail', 'wrong_pin'), 10, 'cada erro de PIN vai para a trilha');
select is((select count(*)::int from audit.event where tenant_id = '00000000-0000-4000-8000-0000000023a0'
             and action like 'boarding.%' and details ?| array['pin', 'pin_mac', 'mac']), 0,
          'a trilha nunca leva o PIN nem o mac');

-- PIN certo: o segredo do link vira a sessão na mesma transação
set local role service_role;
select is(pg_temp.pin('link-2', 'mac-errado'), 'pin_incorreto:false', 'um erro antes');
select is(pg_temp.pin('link-2', 'mac-certo', 'sessao-2'), 'ok:false', 'PIN certo: ok');
select is(pg_temp.pin('link-2', 'mac-certo', 'sessao-3'), 'indisponivel:false', 'o link não vale mais depois do PIN certo');
select is(api.boarding_pin_subject(sha256('link-2'::bytea)), null, 'nem para pedir o profissional');
select is(pg_temp.pin('sessao-2', 'mac-certo', 'sessao-4'), 'indisponivel:false', 'a sessão não serve de link');
reset role;
select ok((select session_started_at is not null and pin_failures_streak = 0 and revoked_at is null
           from pg_temp.grant_de('sessao-2')), 'o grant agora tem o hash da sessão e a hora do início');
select is(pg_temp.eventos('boarding.pin_ok'), 1, 'o PIN certo vai para a trilha');

-- profissional sem PIN (reaproveitado que ainda não criou): conta como erro, sem dizer por quê
set local role service_role;
select is(pg_temp.pin('link-sem-pin', 'mac-certo'), 'pin_incorreto:false', 'sem PIN cadastrado: PIN incorreto');
reset role;
select is((select pin_failures_total from pg_temp.grant_de('link-sem-pin')), 1::smallint, 'e conta no limite');

select * from finish();
rollback;
