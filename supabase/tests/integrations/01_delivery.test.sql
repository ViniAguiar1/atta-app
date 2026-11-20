-- MIG-30 (parte 3): fila de envio (ADR 0005 §1; PDD v206 §9.4, §21, §10.2.1, §10.2.3). Dados fictícios.
begin;
select plan(41);

insert into platform.tenant (id, name) values
  ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A'),
  ('00000000-0000-4000-8000-00000000000b', 'Clínica Fictícia B');
insert into network.person (id, full_name, is_incomplete) values ('00000000-0000-4000-8000-0000000000e1', 'Paciente Fictícia', true);
insert into network.person_tenant_link (tenant_id, person_id)
values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000e1');
insert into platform.professional_tenant_link (id, tenant_id, professional_id, invite_email_hmac, invite_email_enc,
                                               envelope_id, dek_wrapped, kek_version)
values ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-00000000000a', null, sha256('convite@a.test'::bytea),
        '\x01', gen_random_uuid(), '\x01', 1);

create function pg_temp.entrar(p_tenant uuid, p_role text) returns void language plpgsql as $$
declare
  v_user uuid := gen_random_uuid();
  v_membership uuid;
begin
  perform set_config('role', 'postgres', true);
  insert into auth.users (id, email) values (v_user, v_user::text || '@teste.invalid');
  if p_tenant is not null and p_role in ('ADMIN', 'COLABORADOR') then
    insert into platform.membership (tenant_id, user_id, app_role) values (p_tenant, v_user, p_role)
    returning id into v_membership;
  end if;
  -- o Colaborador da clínica vê a agenda (matriz do PDD §10.4.3), mas não Configurações
  if p_role = 'COLABORADOR' then
    insert into platform.membership_permission (tenant_id, membership_id, module, action)
    values (p_tenant, v_membership, 'appointments', 'view')
    on conflict do nothing;   -- o convite já pode trazer o padrão sugerido (PDD §10.4.3)
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'tenant_id', p_tenant, 'app_role', p_role,
                      'aal', case when p_role = 'ADMIN' then 'aal2' else 'aal1' end,
                      'amr', json_build_array(json_build_object('method', 'password',
                                                                'timestamp', extract(epoch from now())::bigint)))::text, true);
end $$;
-- lê a linha como dona (a tabela é fechada) e envelhece a próxima tentativa, para testar o reenvio sem esperar
create function pg_temp.d(p_key text) returns integrations.delivery language sql security definer as $$
  select * from integrations.delivery where idempotency_key = p_key
$$;
create function pg_temp.pronto(p_key text) returns void language sql security definer as $$
  update integrations.delivery set next_attempt_at = now() - interval '1 second' where idempotency_key = p_key
$$;
create function pg_temp.vencer(p_key text) returns void language sql security definer as $$
  update integrations.delivery set valid_until = now() - interval '1 second' where idempotency_key = p_key
$$;
create function pg_temp.codigo(p_key text, p_tenant uuid default '00000000-0000-4000-8000-00000000000a') returns uuid
language sql as $$
  select api.delivery_enqueue(p_tenant, 'whatsapp', 'codigo_verificacao', 'person', '00000000-0000-4000-8000-0000000000e1',
    '{"codigo": "482913"}', p_key, 'sistema', 0::smallint, now() + interval '10 minutes', null, '{sms}', 'appointment',
    '00000000-0000-4000-8000-0000000000a1')
$$;
create function pg_temp.reivindicar(p_key text) returns smallint language sql as $$
  select attempt from api.delivery_claim(100, 60) c where c.idempotency_key = p_key
$$;
do $$ begin
  execute format('grant execute on all functions in schema %I to service_role, authenticated', pg_my_temp_schema()::regnamespace);
end $$;

-- estrutura e permissões ------------------------------------------------------------------------------------------
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'integrations' and c.relkind = 'r' and not (c.relrowsecurity and c.relforcerowsecurity)), 0,
          'toda tabela de integrations com RLS ligada e forçada');
select ok(not has_table_privilege('service_role', 'integrations.delivery', 'SELECT')
          and not has_table_privilege('authenticated', 'integrations.delivery', 'SELECT'),
          'ninguém lê a fila pela tabela, nem o service_role');
select ok(not has_function_privilege('authenticated', 'api.delivery_claim(integer, integer)', 'EXECUTE')
          and not has_function_privilege('anon', 'api.delivery_claim(integer, integer)', 'EXECUTE'),
          'o navegador não reivindica envio');
select ok(not has_function_privilege('authenticated',
          'api.delivery_enqueue(uuid, text, text, text, uuid, jsonb, text, text, smallint, timestamptz, timestamptz, text[], text, uuid, uuid, bytea, bytea, smallint)',
          'EXECUTE'), 'o navegador não enfileira (o tenant viria dele)');
select ok(has_function_privilege('service_role', 'api.delivery_mark_failed(uuid, smallint, text, text)', 'EXECUTE'),
          'o servidor marca a falha');
select ok(not has_function_privilege('anon', 'api.delivery_list(text, uuid, integer, timestamptz)', 'EXECUTE'),
          'anon não lê o histórico');

-- enfileirar: catálogo, referência da clínica e idempotência -------------------------------------------------------
set local role service_role;
select ok(pg_temp.codigo('k1') is not null, 'código enfileirado para a pessoa vinculada à clínica');
select is(pg_temp.codigo('k1'), (select id from pg_temp.d('k1')), 'a mesma chave devolve o mesmo envio (sem duplicar)');
select throws_ok($$ select pg_temp.codigo('k-b', '00000000-0000-4000-8000-00000000000b') $$, 'P0001', 'ATTA-IN-0001',
                 'a clínica B não envia para a pessoa da A');
select throws_ok($$ select api.delivery_enqueue('00000000-0000-4000-8000-00000000000a', 'whatsapp', 'codigo_verificacao', 'person',
                    '00000000-0000-4000-8000-0000000000e1', '{"codigo": "1", "procedimento": "Toxina"}', 'k2', 'sistema') $$,
                 'P0001', 'ATTA-IN-0001', 'variável fora do modelo é recusada antes de gravar (RN-NOT-01)');
select throws_ok($$ select api.delivery_enqueue('00000000-0000-4000-8000-00000000000a', 'email', 'codigo_verificacao', 'person',
                    '00000000-0000-4000-8000-0000000000e1', '{"codigo": "482913"}', 'k3', 'sistema') $$,
                 'P0001', 'ATTA-IN-0001', 'modelo em canal que não existe para ele é recusado');
select throws_ok($$ select api.delivery_enqueue('00000000-0000-4000-8000-00000000000a', 'email', 'texto_livre', 'person',
                    '00000000-0000-4000-8000-0000000000e1', '{}', 'k4', 'sistema') $$,
                 'P0001', 'ATTA-IN-0001', 'modelo fora do catálogo é recusado');
select throws_ok($$ select api.delivery_enqueue('00000000-0000-4000-8000-00000000000a', 'email', 'alerta_equipe', 'professional',
                    '00000000-0000-4000-8000-0000000000d2', '{"evento": "Check-in concluído", "data_hora": "20/11", "link": "x"}',
                    'k5', 'sistema') $$,
                 'P0001', 'ATTA-IN-0001', 'antes do PROpass, o profissional só recebe o convite do PROpass (ADR 0005)');
select lives_ok($$ select api.delivery_enqueue('00000000-0000-4000-8000-00000000000a', 'email', 'convite_propass', 'professional',
                   '00000000-0000-4000-8000-0000000000d2', '{"nome_clinica": "Clínica Fictícia A", "link": "x"}', 'k6', 'sistema') $$,
                'o convite do PROpass vai ao vínculo sem PROpass');
select throws_ok($$ select api.delivery_enqueue('00000000-0000-4000-8000-00000000000a', 'email', 'alerta_equipe', 'email_novo',
                    null, '{"evento": "Check-in concluído", "data_hora": "20/11", "link": "x"}', 'k7', 'sistema',
                    p_id => gen_random_uuid(), p_address_enc => '\x01', p_dek_wrapped => '\x01', p_kek_version => 1::smallint) $$,
                 'P0001', 'ATTA-IN-0001', 'endereço cru só no convite de equipe');

-- reivindicar, enviar e falhar ------------------------------------------------------------------------------------
select is(pg_temp.reivindicar('k1'), 1::smallint, 'reivindicado na tentativa 1, com prioridade');
select is(pg_temp.reivindicar('k1'), null, 'em lease: outro worker não pega o mesmo envio');
select is(api.delivery_mark_failed((pg_temp.d('k1')).id, 1::smallint, 'transitoria', 'http_503'), 'reagendado',
          'falha transitória volta à fila');
select ok((pg_temp.d('k1')).next_attempt_at > now(), 'com espera antes da próxima tentativa');
select is(api.delivery_mark_failed((pg_temp.d('k1')).id, 1::smallint, 'transitoria', 'http_503'), 'ignorado',
          'a tentativa velha de outro worker não mexe no envio');
select pg_temp.pronto('k1');
select is(pg_temp.reivindicar('k1'), 2::smallint, 'segunda tentativa');
select is(api.delivery_mark_failed((pg_temp.d('k1')).id, 2::smallint, 'permanente', 'whatsapp_131026'), 'falhou',
          'falha permanente é definitiva');
select is((pg_temp.d('k1:alt:sms')).channel, 'sms', 'e aciona o SMS (PDD §10.2.1)');
select is((pg_temp.d('k1:alt:sms')).alternatives, '{}'::text[], 'o SMS não tem outro alternativo');
select is((pg_temp.d('k1')).variables, '{"codigo": "***"}'::jsonb, 'o código sai da linha quando o envio termina');
select is((pg_temp.d('k1:alt:sms')).variables, '{"codigo": "482913"}'::jsonb, 'o SMS ainda leva o código');

-- retorno do provedor --------------------------------------------------------------------------------------------
select pg_temp.codigo('k8');
select is(pg_temp.reivindicar('k8'), 1::smallint, 'outro código reivindicado');
select ok(api.delivery_mark_sent((pg_temp.d('k8')).id, 1::smallint, 'wamid.ficticio.1', '••••0001'), 'aceito pelo provedor');
select ok(api.delivery_apply_status('whatsapp', 'wamid.ficticio.1', 'lido', now(), null, true) is not null, 'lido');
select is((select state from pg_temp.d('k8')), 'lido', 'estado lido, com o consumo marcado');
select lives_ok($$ select api.delivery_apply_status('whatsapp', 'wamid.ficticio.1', 'entregue', now()) $$, 'retorno atrasado');
select lives_ok($$ select api.delivery_apply_status('whatsapp', 'wamid.ficticio.1', 'falhou', now(), 'tarde') $$, 'falha depois do fim');
select is(((pg_temp.d('k8')).state, (pg_temp.d('k8:alt:sms')).id), ('lido'::text, null::uuid),
          'não regride, e uma falha depois de entregue não aciona o SMS');
select is((pg_temp.d('k8')).variables, '{"codigo": "***"}'::jsonb, 'entregue ou lido também apaga o código');

-- validade e deduplicação de webhook -----------------------------------------------------------------------------
select pg_temp.codigo('k9');
select pg_temp.vencer('k9');
select is(pg_temp.reivindicar('k9'), null, 'código vencido não é reivindicado');
select is((pg_temp.d('k9')).state, 'expirado', 'e vira expirado');
select is(array[api.webhook_first_time('meta', 'evt-1'), api.webhook_first_time('meta', 'evt-1')], array[true, false],
          'o mesmo webhook só é processado uma vez');

-- histórico da clínica: só o próprio tenant, destino mascarado ----------------------------------------------------
reset role;
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select is((select destination_masked from api.delivery_list() where id = (select id from pg_temp.d('k8'))), '••••0001',
          'o ADMIN vê o histórico com o destino mascarado');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'COLABORADOR');
select is((select count(*)::int from api.delivery_list('appointment', '00000000-0000-4000-8000-0000000000a1')), 4,
          'quem vê a agenda vê os envios daquele atendimento');
select throws_ok($$ select * from api.delivery_list() $$, '42501', 'ATTA-AUTH-0004',
                 'sem Configurações, o Colaborador não vê o histórico geral');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'ADMIN');
select is((select count(*)::int from api.delivery_list()), 0, 'a clínica B não vê os envios da A');

select * from finish();
rollback;
