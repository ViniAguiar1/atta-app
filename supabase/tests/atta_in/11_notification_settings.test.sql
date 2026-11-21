-- MIG-15 (parte 1): Configurações › Notificações (PDD v206 §10.4.6 e §21). Dados fictícios; envelope de teste (bytes
-- fictícios, sem chave real: o banco não abre o envelope, só confere a forma e a máscara).
begin;
select plan(25);

insert into platform.tenant (id, name) values ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A'),
                                              ('00000000-0000-4000-8000-00000000000b', 'Clínica Fictícia B');

create function pg_temp.entrar(p_tenant uuid, p_role text) returns void language plpgsql as $$
declare
  v_user uuid := gen_random_uuid();
begin
  perform set_config('role', 'postgres', true);
  insert into auth.users (id, email) values (v_user, v_user::text || '@teste.invalid');
  if p_tenant is not null and p_role in ('ADMIN', 'COLABORADOR') then
    insert into platform.membership (tenant_id, user_id, app_role) values (p_tenant, v_user, p_role);
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'tenant_id', p_tenant, 'app_role', p_role,
                      'aal', case when p_role = 'ADMIN' then 'aal2' else 'aal1' end,
                      'amr', json_build_array(json_build_object('method', 'password',
                                                                'timestamp', extract(epoch from now())::bigint)))::text, true);
end $$;
-- sqlstate:mensagem:detail (o throws_ok não confere o detail)
create function pg_temp.erro(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v = pg_exception_detail;
  return sqlstate || ':' || sqlerrm || ':' || coalesce(v, '');
end $$;
create function pg_temp.trilha() returns setof jsonb language sql security definer as $$
  select details from audit.event where action = 'notification.settings_update' order by seq
$$;
create function pg_temp.enc() returns bytea language sql as $$ select ('\x010001' || repeat('ab', 40))::bytea $$;
do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated', pg_my_temp_schema()::regnamespace);
end $$;

-- RLS forçada e escrita só pelas funções
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
           where oid in ('atta_in.notification_channel'::regclass, 'atta_in.notification_preference'::regclass,
                         'atta_in.notification_filter'::regclass)), 'RLS forçada nas 3 tabelas');
select ok(not has_table_privilege('authenticated', 'atta_in.notification_preference', 'INSERT')
          and not has_table_privilege('authenticated', 'atta_in.notification_filter', 'UPDATE')
          and not has_column_privilege('authenticated', 'atta_in.notification_channel', 'address_enc', 'SELECT')
          and not has_table_privilege('anon', 'atta_in.notification_channel', 'SELECT'),
          'sem escrita direta; o envelope do endereço não é legível nem pela tabela');

-- só ADMIN (§10.4.3: Configurações é exclusiva do gestor)
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'COLABORADOR');
select throws_ok($$ select api.notification_settings_get() $$, '42501', 'ATTA-AUTH-0004', 'Colaborador não lê');
select throws_ok($$ select api.notification_event_set('checkin_concluido', 'email', true) $$, '42501', 'ATTA-AUTH-0004',
                 'Colaborador não grava');

-- padrão de clínica nova (PDD omisso; Tech Lead): tudo desligado
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select is(api.notification_settings_get() -> 'channels',
          '{"email": {"active": false, "masked": null}, "whatsapp": {"active": false, "masked": null}}'::jsonb,
          'clínica nova: canais desligados, sem endereço');
select is((select jsonb_agg(e ->> 'key') from jsonb_array_elements(api.notification_settings_get() -> 'events') e),
          '["checkin_iniciado", "checkin_concluido", "documento_assinado", "paciente_atrasado", "atendimento_sem_documento",
            "novo_modelo", "documento_vencendo", "documentos_procedimento_atualizados", "membro_convidado",
            "limite_documentos_90"]'::jsonb, 'os 10 eventos do §10.4.6, na ordem da tela');
select ok((select bool_and(not (e ->> 'email')::boolean and not (e ->> 'whatsapp')::boolean)
           from jsonb_array_elements(api.notification_settings_get() -> 'events') e), 'nenhum evento marcado');
select is((select jsonb_agg(distinct e ->> 'category') from jsonb_array_elements(api.notification_settings_get() -> 'events') e),
          '["checkin_atendimentos", "documentos_modelos", "sistema_conta"]'::jsonb, '3 categorias');
select is(api.notification_settings_get() -> 'filters', '{"pausa_noturna": false, "frequencia_resumo": "tempo_real"}'::jsonb,
          'filtros: sem pausa noturna, resumo em tempo real');

-- evento × canal
select lives_ok($$ select api.notification_event_set('checkin_concluido', 'email', true) $$, 'marca um evento no e-mail');
select lives_ok($$ select api.notification_event_set('paciente_atrasado', 'whatsapp', true) $$,
                'marca no WhatsApp com o canal desligado');
select ok((select (e ->> 'email')::boolean and not (e ->> 'whatsapp')::boolean
           from jsonb_array_elements(api.notification_settings_get() -> 'events') e where e ->> 'key' = 'checkin_concluido')
          and (select (e ->> 'whatsapp')::boolean
               from jsonb_array_elements(api.notification_settings_get() -> 'events') e where e ->> 'key' = 'paciente_atrasado'),
          'as marcações ficam guardadas, inclusive com o canal desligado');
select is(pg_temp.erro($$ select api.notification_event_set('consumo_whatsapp_80', 'email', true) $$),
          'P0001:ATTA-IN-0001:event_key', 'evento fora do §10.4.6: recusado');
select is(pg_temp.erro($$ select api.notification_event_set('checkin_concluido', 'sms', true) $$),
          'P0001:ATTA-IN-0001:channel', 'canal fora da lista: recusado');

-- canal: endereço por envelope e máscara
select is(pg_temp.erro($$ select api.notification_channel_set('whatsapp', true) $$), 'P0001:ATTA-IN-0003:address',
          'ligar sem endereço: recusado');
select is(pg_temp.erro($$ select api.notification_channel_set('email', true, pg_temp.enc(), 're•••@cl•••.test') $$),
          'P0001:ATTA-IN-0001:address', 'envelope pela metade: recusado');
select is(pg_temp.erro($$ select api.notification_channel_set('email', true, pg_temp.enc(), 'recepcao@clinica.test',
                                                              gen_random_uuid(), pg_temp.enc(), 1::smallint) $$),
          'P0001:ATTA-IN-0001:address', 'endereço em claro no lugar da máscara: recusado');
select lives_ok($$ select api.notification_channel_set('whatsapp', true, pg_temp.enc(), '(11) •••••-••01',
                                                       gen_random_uuid(), pg_temp.enc(), 1::smallint) $$,
                'liga o WhatsApp com o envelope e a máscara');
select lives_ok($$ select api.notification_channel_set('whatsapp', false) $$, 'desliga sem mandar o endereço de novo');
select lives_ok($$ select api.notification_channel_set('whatsapp', true) $$, 'religa: o endereço guardado continua');
select is(api.notification_settings_get() -> 'channels' -> 'whatsapp', '{"active": true, "masked": "(11) •••••-••01"}'::jsonb,
          'a leitura traz só ligado e a máscara (nunca o envelope)');

-- filtros
select lives_ok($$ select api.notification_filters_set(true, 'diario') $$, 'pausa noturna e resumo diário');
select is(pg_temp.erro($$ select api.notification_filters_set(true, 'mensal') $$), 'P0001:ATTA-IN-0001:frequencia_resumo',
          'frequência fora da lista: recusada');

-- isolamento e trilha
select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'ADMIN');
select ok((api.notification_settings_get() -> 'channels' -> 'whatsapp' ->> 'active')::boolean is false
          and (api.notification_settings_get() -> 'filters' ->> 'frequencia_resumo') = 'tempo_real',
          'a B não vê a configuração da A');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select ok((select count(*) >= 6 and bool_and(not (d ?| array['address', 'address_masked', 'address_enc', 'masked', 'email',
                                                               'whatsapp', 'phone']))
           from pg_temp.trilha() d), 'cada mudança vai para a trilha, sem o endereço nem a máscara');

select * from finish();
rollback;
