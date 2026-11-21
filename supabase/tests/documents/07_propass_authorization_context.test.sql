-- PROpass real: dados da clínica e texto vigente do Termo de Autorização, pelo link (ADR 0001, "Dados da clínica e
-- texto do Termo"; Tech Lead, 21/11). Só dado fictício.
begin;
select plan(10);

insert into platform.tenant (id, name, legal_name, cnpj) values
  ('00000000-0000-4000-8000-0000000007a1', 'Clínica Fictícia Contexto', 'Clínica Fictícia Contexto Ltda', '00000000000701');
insert into platform.professional_tenant_link (id, tenant_id, invite_email_hmac, invite_email_enc, envelope_id, dek_wrapped,
                                               kek_version)
values ('00000000-0000-4000-8000-0000000007d1', '00000000-0000-4000-8000-0000000007a1', sha256('ctx@a.test'::bytea), '\x01',
        gen_random_uuid(), '\x01', 1);
select private.propass_issue('00000000-0000-4000-8000-0000000007a1', '00000000-0000-4000-8000-0000000007d1',
                             sha256('segredo-ficticio-contexto'::bytea));

create function pg_temp.detalhe(p_sql text) returns text language plpgsql as $$
declare d text; m text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics d = pg_exception_detail, m = message_text;
  return m || ':' || d;
end $$;

select ok(has_function_privilege('service_role', 'api.propass_authorization_context(bytea)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'api.propass_authorization_context(bytea)', 'EXECUTE')
          and not has_function_privilege('anon', 'api.propass_authorization_context(bytea)', 'EXECUTE'),
          'só o servidor (service_role) chama');
select results_eq(
  $$ select legal_name, trade_name, cnpj from api.propass_authorization_context(sha256('segredo-ficticio-contexto'::bytea)) $$,
  $$ values ('Clínica Fictícia Contexto Ltda', 'Clínica Fictícia Contexto', '00000000000701') $$,
  'pelo link: razão social, nome e CNPJ do cadastro');
select ok((select c.template_id = v.template_id and c.version = v.version and c.body_sha256 = v.body_sha256
                  and c.body = v.body and c.body_normalization = v.body_normalization
           from api.propass_authorization_context(sha256('segredo-ficticio-contexto'::bytea)) c,
                private.authorization_template_version('00000000-0000-4000-8000-0000000007a1') v),
          'a versão vigente do modelo de sistema, com o body');
select ok((select encode(sha256(convert_to(body, 'UTF8')), 'hex') = body_sha256
           from api.propass_authorization_context(sha256('segredo-ficticio-contexto'::bytea))),
          'o body é o que o body_sha256 assina (o servidor confere antes de preencher)');
select ok((select body like '%{{clinica.razao_social}}%' from api.propass_authorization_context(sha256('segredo-ficticio-contexto'::bytea))),
          'o banco não preenche os campos: o body vem com os {{campos}}');

-- recusas
select is(pg_temp.detalhe($$ select * from api.propass_authorization_context(sha256('outro-segredo'::bytea)) $$),
          'ATTA-AUTH-0004:grant', 'link desconhecido: recusado, sem dizer de qual clínica');
update platform.tenant set legal_name = null where id = '00000000-0000-4000-8000-0000000007a1';
select is(pg_temp.detalhe($$ select * from api.propass_authorization_context(sha256('segredo-ficticio-contexto'::bytea)) $$),
          'ATTA-IN-0003:legal_name', 'sem razão social: recusa (nunca o nome fantasia no lugar)');
update platform.tenant set legal_name = 'Clínica Fictícia Contexto Ltda', cnpj = null where id = '00000000-0000-4000-8000-0000000007a1';
select is(pg_temp.detalhe($$ select * from api.propass_authorization_context(sha256('segredo-ficticio-contexto'::bytea)) $$),
          'ATTA-IN-0003:cnpj', 'sem CNPJ: recusa');
update platform.tenant set cnpj = '00000000000701' where id = '00000000-0000-4000-8000-0000000007a1';
update documents.template set status = 'inativo' where tenant_id = '00000000-0000-4000-8000-0000000007a1';
select is(pg_temp.detalhe($$ select * from api.propass_authorization_context(sha256('segredo-ficticio-contexto'::bytea)) $$),
          'ATTA-IN-0003:authorization_template', 'sem o modelo de sistema Ativo: recusa');
update platform.access_grant set revoked_at = now() where secret_hash = sha256('segredo-ficticio-contexto'::bytea);
select is(pg_temp.detalhe($$ select * from api.propass_authorization_context(sha256('segredo-ficticio-contexto'::bytea)) $$),
          'ATTA-AUTH-0004:grant', 'link revogado: recusado');

select * from finish();
rollback;
