-- MIG-04 (S2-4): origem da trilha. ip = x-atta-client-ip (servidor do Next); ip_borda = cf-connecting-ip; nunca o 1º
-- x-forwarded-for. O hash de evento sem ip_borda é o mesmo de antes (eventos antigos continuam verificando).
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into audit.action (action, kind, scope) values ('teste.origem', 'access', 'network');

-- x-forwarded-for forjado, sem x-atta-client-ip: ip nulo
select set_config('request.headers', '{"x-forwarded-for":"203.0.113.7"}', true);
select audit.record_event('teste.origem', 'network.person', null);
select is((select ip from audit.event order by seq desc limit 1), null, 'x-forwarded-for forjado sem x-atta-client-ip: ip nulo');
select is((select ip_borda from audit.event order by seq desc limit 1), null, 'sem cf-connecting-ip: ip_borda nulo (nunca cai para o x-forwarded-for)');

-- x-atta-client-ip inválido ou faixa: nulo
select set_config('request.headers', '{"x-atta-client-ip":"nao-e-ip"}', true);
select audit.record_event('teste.origem', 'network.person', null);
select is((select ip from audit.event order by seq desc limit 1), null, 'x-atta-client-ip inválido: ip nulo');
select set_config('request.headers', '{"x-atta-client-ip":"10.0.0.0/8"}', true);
select audit.record_event('teste.origem', 'network.person', null);
select is((select ip from audit.event order by seq desc limit 1), null, 'x-atta-client-ip com faixa: ip nulo');

-- válidos: ip do servidor e ip da borda, IPv4 e IPv6
select set_config('request.headers', '{"x-atta-client-ip":"198.51.100.23","cf-connecting-ip":"2001:db8::7","x-forwarded-for":"203.0.113.7"}', true);
select audit.record_event('teste.origem', 'network.person', null);
select is((select host(ip) from audit.event order by seq desc limit 1), '198.51.100.23', 'ip = x-atta-client-ip válido');
select is((select host(ip_borda) from audit.event order by seq desc limit 1), '2001:db8::7', 'ip_borda = cf-connecting-ip');

-- o hash de evento sem ip_borda é a fórmula antiga (antes desta migration), byte a byte
select ok((select e.hash = encode(sha256(convert_to(jsonb_build_object(
    'seq', e.seq, 'id', e.id, 'created_at', to_char(e.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'tenant_id', e.tenant_id, 'actor', e.actor, 'app_role', e.app_role, 'action', e.action, 'entity', e.entity,
    'entity_id', e.entity_id, 'details', e.details, 'before', e.before, 'after', e.after, 'ip', host(e.ip),
    'request_id', e.request_id, 'prev_hash', e.prev_hash)::text, 'UTF8')), 'hex')
  from audit.event e where e.ip_borda is null order by e.seq desc limit 1), 'evento sem ip_borda: hash pela fórmula antiga');
-- e o com ip_borda leva a chave no hash (adulterar o ip_borda quebra a cadeia)
select ok((select e.hash <> encode(sha256(convert_to(jsonb_build_object(
    'seq', e.seq, 'id', e.id, 'created_at', to_char(e.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'tenant_id', e.tenant_id, 'actor', e.actor, 'app_role', e.app_role, 'action', e.action, 'entity', e.entity,
    'entity_id', e.entity_id, 'details', e.details, 'before', e.before, 'after', e.after, 'ip', host(e.ip),
    'request_id', e.request_id, 'prev_hash', e.prev_hash)::text, 'UTF8')), 'hex')
  from audit.event e where e.ip_borda is not null order by e.seq desc limit 1), 'evento com ip_borda: a chave entra no hash');

-- cadeia íntegra misturando eventos com e sem ip_borda (e os commitados de antes, se houver)
select is(audit.verify_chain(), null, 'verify_chain íntegro com eventos com e sem ip_borda');
set local role audit_owner;
alter table audit.event no force row level security;
alter table audit.event disable trigger event_append_only;
update audit.event set ip_borda = '192.0.2.1' where seq = (select max(seq) from audit.event where ip_borda is not null);
reset role;
select is(audit.verify_chain(), (select max(seq) from audit.event where ip_borda is not null), 'ip_borda adulterado: verify_chain aponta o evento');

select * from finish();
rollback;
