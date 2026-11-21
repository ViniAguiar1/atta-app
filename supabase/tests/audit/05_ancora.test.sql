-- MIG-05 · âncora da trilha (PLANO, MIG-05; ADR 0003). Prova que só o service_role lê o fim da cadeia e confere
-- âncoras, e que a âncora pega o que o verify_chain sozinho não pega: o fim apagado com a cabeça acertada (missing) e a
-- cadeia reescrita de forma consistente (mismatch). Linha adulterada sem recalcular continua chain_broken.
-- Só dados fictícios; tudo desfeito no rollback.
begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to audit_owner;
grant execute on all functions in schema extensions to audit_owner, service_role;
select plan(19);

-- ---------------------------------------------------------------- quem chama
select ok(not has_function_privilege('anon', 'api.audit_anchor_head()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'api.audit_anchor_head()', 'EXECUTE'), 'anon e authenticated não leem o fim da cadeia');
select ok(not has_function_privilege('anon', 'api.audit_anchor_check(jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'api.audit_anchor_check(jsonb)', 'EXECUTE'), 'anon e authenticated não conferem âncoras');
select ok(has_function_privilege('service_role', 'api.audit_anchor_head()', 'EXECUTE')
  and has_function_privilege('service_role', 'api.audit_anchor_check(jsonb)', 'EXECUTE'), 'o servidor (service_role) chama as duas');
select ok(not has_function_privilege('service_role', 'audit.anchor_head()', 'EXECUTE'), 'a cabeça só pela função de api (audit fechado)');

-- ---------------------------------------------------------------- eventos fictícios
insert into audit.action (action, kind) values ('teste.ancora', 'access') on conflict (action) do nothing;
select audit.record_event('teste.ancora', 'platform.tenant', gen_random_uuid(), '{}'::jsonb, null, null,
  'aaaaaaaa-0000-4000-8000-000000000001') from generate_series(1, 4);
select set_config('teste.ultimo', (select max(e.seq)::text from audit.event e), true);
select set_config('teste.segundo', (select e.seq::text from audit.event e where e.action = 'teste.ancora' order by e.seq offset 1 limit 1), true);
create function pg_temp.ancora(p_seq text) returns jsonb language sql security definer as $$
  select jsonb_build_object('seq', e.seq, 'hash', e.hash) from audit.event e where e.seq = p_seq::bigint
$$;
grant execute on function pg_temp.ancora(text) to service_role;
select set_config('teste.a_ultimo', pg_temp.ancora(current_setting('teste.ultimo'))::text, true);
select set_config('teste.a_segundo', pg_temp.ancora(current_setting('teste.segundo'))::text, true);

-- ---------------------------------------------------------------- o fim da cadeia e a conferência
set local role service_role;
select is((select seq::text from api.audit_anchor_head()), current_setting('teste.ultimo'), 'o fim da cadeia é o último evento');
select is((select jsonb_build_object('seq', seq, 'hash', hash) from api.audit_anchor_head()), current_setting('teste.a_ultimo')::jsonb,
  'o hash do fim é o do último evento');
select is((select broken_at from api.audit_anchor_head()), null, 'cadeia íntegra: broken_at nulo (a cron pode ancorar)');
select isnt((select event_at from api.audit_anchor_head()), null, 'a âncora leva o momento do evento');
select is((select status from api.audit_anchor_check(jsonb_build_array(current_setting('teste.a_ultimo')::jsonb))), 'ok',
  'âncora conferida com a trilha intacta: ok');
select is((select status from api.audit_anchor_check(jsonb_build_array(
  jsonb_build_object('seq', current_setting('teste.ultimo')::bigint, 'hash', repeat('a', 64))))), 'mismatch', 'hash diferente: mismatch');
select is((select status from api.audit_anchor_check(('[{"seq": 999999999999, "hash": "' || repeat('b', 64) || '"}]')::jsonb)), 'missing',
  'evento ancorado que não existe: missing');
select throws_ok($$ select * from api.audit_anchor_check('{"seq": 1}'::jsonb) $$, 'P0001', 'ATTA-IN-0001', 'âncoras fora do formato (não é lista)');
select throws_ok($$ select * from api.audit_anchor_check('[{"seq": 1, "hash": "nao-e-hash"}]'::jsonb) $$, 'P0001', 'ATTA-IN-0001',
  'âncora com hash fora do formato');
reset role;

-- ---------------------------------------------------------------- invasor com a dona: apaga o fim e acerta a cabeça
set local role audit_owner;
alter table audit.event no force row level security;
alter table audit.event disable trigger event_append_only;
delete from audit.event where seq = current_setting('teste.ultimo')::bigint;
update audit.chain_head set (last_seq, last_hash) = (select e.seq, e.hash from audit.event e order by e.seq desc limit 1) where id;
reset role;
select is(audit.verify_chain(), null, 'fim apagado com a cabeça acertada: o verify_chain sozinho não percebe');
set local role service_role;
select is((select status from api.audit_anchor_check(jsonb_build_array(current_setting('teste.a_ultimo')::jsonb))), 'missing',
  'a âncora percebe: o evento ancorado sumiu (missing)');
select is((select status from api.audit_anchor_check(jsonb_build_array(current_setting('teste.a_segundo')::jsonb))), 'ok',
  'as âncoras de antes do ponto apagado continuam ok');
reset role;

-- ---------------------------------------------------------------- invasor com a dona: reescreve a cadeia inteira
set local role audit_owner;
do $$
declare
  v_inicio bigint := (select min(seq) from audit.event where action = 'teste.ancora');
  v_anterior text;
  r audit.event;
begin
  update audit.event set details = '{"motivo":"reescrito"}' where seq = v_inicio;
  select coalesce((select e.hash from audit.event e where e.seq < v_inicio order by e.seq desc limit 1), repeat('0', 64))
    into v_anterior;
  for r in select * from audit.event where seq >= v_inicio order by seq loop
    r.prev_hash := v_anterior;
    r.hash := audit.event_digest(r);
    update audit.event set prev_hash = r.prev_hash, hash = r.hash where seq = r.seq;
    v_anterior := r.hash;
  end loop;
  update audit.chain_head set last_hash = v_anterior where id;
end $$;
reset role;
select is(audit.verify_chain(), null, 'cadeia reescrita de forma consistente: o verify_chain sozinho não percebe');
set local role service_role;
select is((select status from api.audit_anchor_check(jsonb_build_array(current_setting('teste.a_segundo')::jsonb))), 'mismatch',
  'a âncora percebe: o evento ancorado tem outro hash (mismatch)');
reset role;

-- ---------------------------------------------------------------- linha adulterada sem recalcular
set local role audit_owner;
update audit.event set details = '{"motivo":"sem recalcular"}' where seq = current_setting('teste.segundo')::bigint;
reset role;
set local role service_role;
select is((select status from api.audit_anchor_check(jsonb_build_array(current_setting('teste.a_segundo')::jsonb))), 'chain_broken',
  'cadeia que não fecha: chain_broken');
reset role;

select * from finish();
rollback;
