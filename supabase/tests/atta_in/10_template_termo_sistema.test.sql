-- Termo de Autorização do profissional como modelo de sistema (decisão do CTO, PLANO P2c; ADR 0001 §1). A ATTA publica
-- por seed (dono); a clínica não cria, não edita, não inativa nem publica esse kind. Só dado fictício.
begin;
select plan(12);

insert into platform.tenant (id, name) values ('00000000-0000-4000-8000-00000000010a', 'Clínica Fictícia Termo Sistema');

create function pg_temp.entrar(p_tenant uuid) returns void language plpgsql as $$
declare v_user uuid;
begin
  perform set_config('role', 'postgres', true);
  select m.user_id into v_user from platform.membership m
  where m.tenant_id = p_tenant and m.app_role = 'ADMIN' and m.status = 'active' and m.deleted_at is null limit 1;
  if v_user is null then
    v_user := gen_random_uuid();
    insert into auth.users (id, email) values (v_user, v_user::text || '@teste.invalid');
    insert into platform.membership (tenant_id, user_id, app_role) values (p_tenant, v_user, 'ADMIN');
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'tenant_id', p_tenant, 'app_role', 'ADMIN', 'aal', 'aal2',
      'amr', json_build_array(json_build_object('method', 'password',
                                                'timestamp', extract(epoch from now())::bigint)))::text, true);
end $$;
create function pg_temp.termo() returns uuid language sql as $$
  select id from documents.template where kind = 'termo_de_autorizacao'
$$;
create function pg_temp.detalhe(p_sql text) returns text language plpgsql as $$
declare d text; m text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics d = pg_exception_detail, m = message_text;
  return m || ':' || d;
end $$;
-- uma função SECURITY DEFINER qualquer (dona postgres), como uma RPC nova que alguém crie: dentro dela o current_user
-- é o dono, mas o usuário do token continua lá, e a trava pega
create function pg_temp.renomear_termo_definer(p_titulo text) returns void language sql security definer as $$
  update documents.template set title = p_titulo where kind = 'termo_de_autorizacao'
$$;
do $$ begin
  execute format('grant execute on all functions in schema %I to authenticated', pg_my_temp_schema()::regnamespace);
end $$;

-- o seed do dono (como a migration do Backend 3 fará) passa pela trava -------------------------------------------
select lives_ok($$
  insert into documents.template (tenant_id, kind, title, frequency, required, draft_body)
  values ('00000000-0000-4000-8000-00000000010a', 'termo_de_autorizacao', 'Termo de Autorização de Uso de Imagem de Assinatura',
          'unica', true, 'Texto fictício da autorização.');
  insert into documents.template_version (tenant_id, template_id, version, kind, title, frequency, required, body,
                                          body_sha256, published_by)
  select t.tenant_id, t.id, 1, t.kind, t.title, t.frequency, t.required, t.draft_body,
         encode(sha256(convert_to(t.draft_body, 'UTF8')), 'hex'), gen_random_uuid()
  from documents.template t where t.kind = 'termo_de_autorizacao';
  update documents.template set status = 'ativo', current_version = 1 where kind = 'termo_de_autorizacao'
$$, 'o dono (postgres) publica o modelo de sistema por seed');

-- a clínica não cria nem mexe ------------------------------------------------------------------------------------
select pg_temp.entrar('00000000-0000-4000-8000-00000000010a');
select is(pg_temp.detalhe($$ insert into documents.template (kind, title) values ('termo_de_autorizacao', 'Termo plantado') $$),
          'ATTA-IN-0003:kind', 'ADMIN não cria Termo de Autorização');
select is(pg_temp.detalhe(format('update documents.template set title = %L where id = %L', 'Título trocado', pg_temp.termo())),
          'ATTA-IN-0003:kind', 'ADMIN não edita o Termo de Autorização');
select is(pg_temp.detalhe(format('update documents.template set draft_body = %L where id = %L', 'Outro texto.', pg_temp.termo())),
          'ATTA-IN-0003:kind', 'ADMIN não edita o texto do Termo de Autorização');
select is(pg_temp.detalhe(format('select * from api.atta_in_template_publish(%L)', pg_temp.termo())),
          'ATTA-IN-0003:kind', 'ADMIN não publica o Termo de Autorização');
select is(pg_temp.detalhe(format('select api.template_deactivate(%L)', pg_temp.termo())),
          'ATTA-IN-0003:kind', 'ADMIN não inativa o Termo de Autorização');
select is(pg_temp.detalhe($$ select pg_temp.renomear_termo_definer('Título por função') $$),
          'ATTA-IN-0003:kind', 'nem por função SECURITY DEFINER chamada pelo ADMIN (o usuário do token conta)');
insert into documents.template (kind, title, draft_body) values ('personalizado', 'Personalizado fictício', 'Texto.');
select is(pg_temp.detalhe($$ update documents.template set kind = 'termo_de_autorizacao' where title = 'Personalizado fictício' $$),
          'ATTA-IN-0003:kind', 'nem transformando outro modelo em Termo de Autorização');

-- aparece na lista, só para leitura --------------------------------------------------------------------------------
select is((select allowed_actions from api.atta_in_template_list() where kind = 'termo_de_autorizacao'), '[]'::jsonb,
          'na lista, sem nenhuma ação');
select is((select status || ' v' || current_version || ' ' || current_required from api.atta_in_template_list()
           where kind = 'termo_de_autorizacao'), 'ativo v1 true', 'na lista, Ativo na versão do seed');
select is((select title from documents.template where id = pg_temp.termo()), 'Termo de Autorização de Uso de Imagem de Assinatura',
          'o texto e o título do seed não mudaram');
select isnt((select allowed_actions from api.atta_in_template_list() where title = 'Personalizado fictício'), '[]'::jsonb,
            'os outros modelos continuam com as ações');

select * from finish();
rollback;
