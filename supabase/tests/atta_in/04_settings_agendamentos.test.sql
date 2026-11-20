-- MIG-10b: Configurações › Agendamentos (Link Check-in Online, celulares do Fluxo alternativo, leitura da tela) e S3-2
-- (grant por coluna e auditoria em atta_in.setting). Dados fictícios: bytes e rótulos inventados.
begin;
select plan(30);

insert into platform.tenant (id, name) values
  ('00000000-0000-4000-8000-00000000000a', 'Clínica Fictícia A'),
  ('00000000-0000-4000-8000-00000000000b', 'Clínica Fictícia B');

create function pg_temp.entrar(p_tenant uuid, p_role text) returns void language plpgsql as $$
declare
  v_user uuid := gen_random_uuid();
begin
  -- usuário fictício com vínculo ativo na clínica: o has_permission do MIG-02 confere o vínculo no banco
  perform set_config('role', 'postgres', true);
  insert into auth.users (id, email) values (v_user, v_user::text || '@teste.invalid');
  if p_tenant is not null and p_role in ('ADMIN', 'COLABORADOR') then
    insert into platform.membership (tenant_id, user_id, app_role) values (p_tenant, v_user, p_role);
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'tenant_id', p_tenant, 'app_role', p_role,
                      -- ADMIN só com o 2º fator no token (MIG-03)
                      'aal', case when p_role = 'ADMIN' then 'aal2' else 'aal1' end,
                      -- hora do login (sessão de 12 h, MIG-03 do Backend 1)
                      'amr', json_build_array(json_build_object('method', 'password',
                                                                'timestamp', extract(epoch from now())::bigint)))::text, true);
end $$;

create function pg_temp.remover_vinculo() returns void language plpgsql as $$
begin
  -- o vínculo sai do banco, mas o token continua válido (regra da ADR 0001 §2, revisão do MIG-02)
  perform set_config('role', 'postgres', true);
  update platform.membership set deleted_at = now()
  where user_id = (current_setting('request.jwt.claims')::jsonb ->> 'sub')::uuid;
  perform set_config('role', 'authenticated', true);
end $$;

create function pg_temp.salvar(p_key text, p_value int) returns void language sql as $$
  select null from atta_in.set_setting(p_key, to_jsonb(p_value))
$$;
create function pg_temp.celular(p_label text) returns void language sql as $$
  insert into atta_in.alt_flow_phone (id, tenant_id, label, phone_masked, phone_enc, dek_wrapped, kek_version)
  values (gen_random_uuid(), (select private.current_tenant_id()), p_label, '(11) 9••••-0000', '\x01aa', '\x01bb', 1)
$$;
create function pg_temp.chaves_da_trilha() returns text language sql security definer as $$
  select string_agg(distinct k, ',' order by k) from audit.event e, jsonb_object_keys(e.after) k
  where e.action = 'setting.change'
$$;
create function pg_temp.eventos(p_action text) returns int language sql security definer as $$
  select count(*)::int from audit.event where action = p_action
$$;

do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated', pg_my_temp_schema()::regnamespace);
end $$;

-- leitura da tela: padrões do PDD e limites (PDD omisso nos limites: decididos pelo CTO, R9)
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select is((select count(*)::int from atta_in.settings_screen()), 7, 'a tela lê as 7 chaves numa chamada');
select results_eq($$ select key, value_int, source, min_int, max_int from atta_in.settings_screen()
                     where key in ('link_envio_antecedencia_h', 'link_validade_apos_h', 'lembrete_1_min', 'lembrete_2_min')
                     order by key $$,
                  $$ values ('lembrete_1_min', 60::bigint, 'sistema', 15::bigint, 240::bigint),
                            ('lembrete_2_min', 30::bigint, 'sistema', 5::bigint, 120::bigint),
                            ('link_envio_antecedencia_h', 3::bigint, 'sistema', 1::bigint, 24::bigint),
                            ('link_validade_apos_h', 1::bigint, 'sistema', 0::bigint, 4::bigint) $$,
                  'Link Check-in Online: 3 h antes, até 1 h depois, lembretes de 60 e 30 min, com os limites');
select ok((select allowed_ints = array[0, 15, 30, 60, 90, 120]::bigint[] from atta_in.settings_screen()
           where key = 'tolerancia_da_ausencia_min'), 'a ausência automática traz os valores permitidos');

-- escrita: limites e regras cruzadas
select throws_ok($$ select pg_temp.salvar('link_envio_antecedencia_h', 25) $$, 'P0001', 'ATTA-IN-0001',
                 'envio acima de 24 h é recusado');
select throws_ok($$ select pg_temp.salvar('lembrete_2_min', 60) $$, 'P0001', 'ATTA-IN-0003',
                 'o 2º lembrete precisa vir antes do 1º');
select throws_ok($$ select pg_temp.salvar('lembrete_1_min', 200) $$, 'P0001', 'ATTA-IN-0003',
                 'o 1º lembrete precisa caber na antecedência do envio (3 h)');
select lives_ok($$ select pg_temp.salvar('link_envio_antecedencia_h', 4) $$, 'envio 4 h antes');
select lives_ok($$ select pg_temp.salvar('lembrete_1_min', 200) $$, 'agora o 1º lembrete de 200 min cabe');
select lives_ok($$ select pg_temp.salvar('link_validade_apos_h', 0) $$, 'validade até o horário (0 h depois)');
select ok((select value_int = 200 and source = 'unidade' from atta_in.settings_screen() where key = 'lembrete_1_min'),
          'a tela mostra o valor gravado e a origem unidade');
select throws_ok($$ select pg_temp.salvar('link_envio_antecedencia_h', 3) $$, 'P0001', 'ATTA-IN-0003',
                 'baixar o envio para 3 h com o lembrete de 200 min é conflito (a transação volta)');

-- as regras valem também para escrita direta e para todos os escopos (gatilho adiado; aqui conferido na hora)
set constraints all immediate;
select throws_ok($$ update atta_in.setting set value_int = 3 where key = 'link_envio_antecedencia_h' $$,
                 'P0001', 'ATTA-IN-0003',
                 'escrita direta na tabela também respeita as regras (envio de 3 h com o 1º lembrete de 200 min)');
select lives_ok($$ select null from atta_in.set_setting('lembrete_1_min', '180', 'consulta') $$,
                'consulta com 1º lembrete de 180 min (cabe nas 4 h da unidade)');
select lives_ok($$ select pg_temp.salvar('lembrete_1_min', 60) $$, 'unidade volta ao 1º lembrete de 60 min');
select throws_ok($$ select pg_temp.salvar('link_envio_antecedencia_h', 2) $$, 'P0001', 'ATTA-IN-0003',
                 'baixar o envio da unidade para 2 h deixaria a consulta incoerente: recusado');
set constraints all deferred;

-- S3-2: grant por coluna, carimbo de quem mudou e auditoria
select throws_ok($$ update atta_in.setting set key = 'lembrete_2_min' where key = 'lembrete_1_min' $$, '42501', null,
                 'ninguém troca a chave por fora');
select throws_ok($$ update atta_in.setting set created_by = gen_random_uuid() $$, '42501', null,
                 'ninguém grava created_by por fora');
select ok((select updated_by = (current_setting('request.jwt.claims')::jsonb ->> 'sub')::uuid
           from atta_in.setting where key = 'lembrete_1_min' and level = 'unidade'), 'o banco carimba quem mudou');
select is(pg_temp.eventos('setting.change'), 5, 'cada mudança de configuração vai para a auditoria (só as que gravaram)');
select ok(pg_temp.chaves_da_trilha() !~ '(^|,)value(,|$)', 'a trilha usa o nome da configuração, nunca a chave value');

-- celulares do Fluxo alternativo: cifrados, o painel lê só a máscara; até 10
select lives_ok($$ select pg_temp.celular('Recepção') $$, 'ADMIN cadastra um celular da clínica');
select is((select phone_masked from atta_in.alt_flow_phone), '(11) 9••••-0000', 'a lista mostra a máscara');
select throws_ok($$ select phone_enc from atta_in.alt_flow_phone $$, '42501', null,
                 'o número cifrado não sai pelo painel (só pelo servidor, para o envio)');
select lives_ok($$ select pg_temp.celular('Celular ' || g) from generate_series(2, 10) g $$, 'até 10 celulares');
select throws_ok($$ select pg_temp.celular('Décimo primeiro') $$, 'P0001', 'ATTA-IN-0003', 'o 11º celular é recusado');
select lives_ok($$ delete from atta_in.alt_flow_phone where label = 'Recepção' $$, 'remover um celular');
select is(pg_temp.eventos('alt_flow_phone.change'), 11, 'cada inclusão e remoção de celular vai para a auditoria');

-- Colaborador não mexe em Configurações; a B não vê nada da A; vínculo removido não lê
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'COLABORADOR');
select throws_ok($$ select * from atta_in.settings_screen() $$, '42501', 'ATTA-AUTH-0004',
                 'Colaborador não lê Configurações');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000b', 'ADMIN');
select is((select count(*)::int from atta_in.alt_flow_phone), 0, 'B não vê os celulares da A');
select pg_temp.entrar('00000000-0000-4000-8000-00000000000a', 'ADMIN');
select pg_temp.remover_vinculo();
select throws_ok($$ select * from atta_in.settings_screen() $$, '42501', 'ATTA-AUTH-0004',
                 'vínculo removido: o ADMIN não lê Configurações');

select * from finish();
rollback;
