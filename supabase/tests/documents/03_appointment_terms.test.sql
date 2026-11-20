-- MIG-21 (parte 2): termos do atendimento. PDD v206 §10.2.1, §10.2.2, §10.2.3, §16.4 e §17.6. Só dado fictício.
begin;
select plan(33);

insert into platform.tenant (id, name) values
  ('00000000-0000-4000-8000-0000000003a1', 'Clínica Fictícia Termos A'),
  ('00000000-0000-4000-8000-0000000003b1', 'Clínica Fictícia Termos B');
insert into network.person (id, full_name, is_incomplete) values ('00000000-0000-4000-8000-0000000003e1', 'Paciente Fictícia Termos', true);
insert into network.person_tenant_link (tenant_id, person_id) values ('00000000-0000-4000-8000-0000000003a1', '00000000-0000-4000-8000-0000000003e1');
insert into network.person_import_provisional (id, tenant_id, import_batch_id, cpf_hmac, cpf_masked, cpf_enc, full_name,
                                               dek_wrapped, kek_version)
values ('00000000-0000-4000-8000-0000000003e9', '00000000-0000-4000-8000-0000000003a1', gen_random_uuid(), sha256('cpf-prov-termos'::bytea),
        '···.···.000-00', '\x01', 'Provisório Fictício Termos', '\x01', 1);
insert into platform.professional (id, display_name, council, council_uf, council_number, cpf_hmac, cpf_masked, cpf_enc,
                                   email_enc, dek_wrapped, kek_version)
values ('00000000-0000-4000-8000-0000000003f1', 'Dra. Fictícia Termos', 'cro', 'SP', '54321', sha256('cpf-prof-termos'::bytea),
        '···.···.000-01', '\x01', '\x01', '\x01', 1);
insert into platform.professional_tenant_link (id, tenant_id, professional_id, invite_email_hmac, invite_email_enc,
                                               envelope_id, dek_wrapped, kek_version, propass_completed_at,
                                               privacy_notice_version, privacy_notice_ack_at)
values ('00000000-0000-4000-8000-0000000003d1', '00000000-0000-4000-8000-0000000003a1', '00000000-0000-4000-8000-0000000003f1',
        sha256('dra-termos@a.test'::bytea), '\x01', gen_random_uuid(), '\x01', 1, now(), 'v1', now());

-- modelos (direto como dono, como a publicação deixaria): obrigatório, opcional, rascunho, Termo de Autorização e um
-- Ativo de outra clínica
create function pg_temp.modelo(p_id uuid, p_tenant uuid, p_kind text, p_title text, p_required boolean,
                               p_publicar boolean default true) returns void language plpgsql as $$
begin
  insert into documents.template (id, tenant_id, kind, title, frequency, required, draft_body)
  values (p_id, p_tenant, p_kind, p_title, case when p_kind = 'termo_de_autorizacao' then 'unica' else 'por_procedimento' end,
          p_required, 'Texto fictício de ' || p_title || '.');
  if p_publicar then
    insert into documents.template_version (tenant_id, template_id, version, kind, title, frequency, required, body,
                                            body_sha256, published_by)
    select tenant_id, id, 1, kind, title, frequency, required, draft_body,
           encode(sha256(convert_to(draft_body, 'UTF8')), 'hex'), gen_random_uuid()
    from documents.template where id = p_id;
    update documents.template set status = 'ativo', current_version = 1 where id = p_id;
  end if;
end $$;
select pg_temp.modelo('00000000-0000-4000-8000-000000003101', '00000000-0000-4000-8000-0000000003a1', 'tcle', 'TCLE fictício', true);
select pg_temp.modelo('00000000-0000-4000-8000-000000003102', '00000000-0000-4000-8000-0000000003a1', 'personalizado', 'Opcional fictício', false);
select pg_temp.modelo('00000000-0000-4000-8000-000000003103', '00000000-0000-4000-8000-0000000003a1', 'tcle', 'Rascunho fictício', true, false);
select pg_temp.modelo('00000000-0000-4000-8000-000000003104', '00000000-0000-4000-8000-0000000003a1', 'termo_de_autorizacao', 'Autorização fictícia', true);
select pg_temp.modelo('00000000-0000-4000-8000-000000003105', '00000000-0000-4000-8000-0000000003b1', 'tcle', 'TCLE da outra clínica', true);

create function pg_temp.agendar(p_id uuid, p_dias int, p_person uuid default '00000000-0000-4000-8000-0000000003e1',
                                p_prov uuid default null) returns void language sql as $$
  insert into atta_in.appointment (id, tenant_id, person_id, provisional_patient_id, professional_link_id,
                                   appointment_type, starts_at, ends_at)
  values (p_id, '00000000-0000-4000-8000-0000000003a1', p_person, p_prov, '00000000-0000-4000-8000-0000000003d1', 'consulta',
          now() + make_interval(days => p_dias), now() + make_interval(days => p_dias) + interval '1 hour')
$$;
select pg_temp.agendar('00000000-0000-4000-8000-0000000031a1', 1);
select pg_temp.agendar('00000000-0000-4000-8000-0000000031a2', 2, null, '00000000-0000-4000-8000-0000000003e9');
select pg_temp.agendar('00000000-0000-4000-8000-0000000031a3', 3);
select pg_temp.agendar('00000000-0000-4000-8000-0000000031a4', 4);
select pg_temp.agendar('00000000-0000-4000-8000-0000000031a5', 5);
select pg_temp.agendar('00000000-0000-4000-8000-0000000031a6', 6);

create function pg_temp.mover(p_appointment uuid, p_to text, p_reason text default null) returns void language sql as $$
  select atta_in.apply_transition(p_appointment, '00000000-0000-4000-8000-0000000003a1', p_to, p_reason)
$$;
create function pg_temp.doc(p_appointment uuid, p_template uuid) returns uuid language sql as $$
  select d.id from documents.document d join documents.template_version v on v.id = d.template_version_id
  where d.appointment_id = p_appointment and v.template_id = p_template
  order by d.status in ('recusado', 'cancelado'), d.created_at desc, d.id limit 1   -- o vivo antes do recusado
$$;
create function pg_temp.assinar(p_doc uuid, p_status text) returns void language sql as $$
  update documents.document set status = p_status where id = p_doc   -- a assinatura de verdade vem no MIG-21c
$$;
create function pg_temp.eventos(p_action text, p_appointment uuid) returns int language sql as $$
  select count(*)::int from audit.event where action = p_action and details ->> 'appointment_id' = p_appointment::text
$$;
create function pg_temp.detalhe(p_sql text) returns text language plpgsql as $$
declare d text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics d = pg_exception_detail;
  return d;
end $$;

-- permissões ----------------------------------------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'private.appointment_link_documents(uuid, uuid[])', 'EXECUTE')
          and not has_function_privilege('service_role', 'private.appointment_link_documents(uuid, uuid[])', 'EXECUTE')
          and not has_function_privilege('authenticated', 'private.appointment_terms_ready(uuid)', 'EXECUTE')
          and not has_function_privilege('service_role', 'private.appointment_terms_pending(uuid)', 'EXECUTE'),
          'as funções dos termos não têm EXECUTE para os papéis da API (quem chama é o fluxo do Backend 2)');

-- vincular ------------------------------------------------------------------------------------------------------------
select is((select count(*)::int from private.appointment_link_documents('00000000-0000-4000-8000-0000000031a1',
             array['00000000-0000-4000-8000-000000003101', '00000000-0000-4000-8000-000000003102']::uuid[]) where created),
          2, '§10.2.1: vincula os modelos escolhidos ao agendamento');
select results_eq($$ select status, folder_section, person_id::text from documents.document
                    where appointment_id = '00000000-0000-4000-8000-0000000031a1' order by id $$,
                  $$ values ('aguardando_assinatura', 'termos', '00000000-0000-4000-8000-0000000003e1'),
                            ('aguardando_assinatura', 'termos', '00000000-0000-4000-8000-0000000003e1') $$,
                  'nascem Aguardando assinatura, na pasta Termos do paciente do agendamento');
select is((select v.version from documents.document d join documents.template_version v on v.id = d.template_version_id
           where d.id = pg_temp.doc('00000000-0000-4000-8000-0000000031a1', '00000000-0000-4000-8000-000000003101')), 1,
          'RN-DOC-02: o documento aponta para a versão vigente');
select results_eq($$ select created from private.appointment_link_documents('00000000-0000-4000-8000-0000000031a1',
                       array['00000000-0000-4000-8000-000000003101']::uuid[]) $$, $$ values (false) $$,
                  'vincular de novo o mesmo modelo não duplica');
select is(pg_temp.eventos('document.link', '00000000-0000-4000-8000-0000000031a1'), 2, 'cada vínculo novo vai à trilha');
select throws_ok($$ select * from private.appointment_link_documents('00000000-0000-4000-8000-0000000031a1',
                      array['00000000-0000-4000-8000-000000003103']::uuid[]) $$, 'P0002', 'ATTA-CORE-0005',
                 'modelo em Rascunho não vincula');
select throws_ok($$ select * from private.appointment_link_documents('00000000-0000-4000-8000-0000000031a1',
                      array['00000000-0000-4000-8000-000000003104']::uuid[]) $$, 'P0002', 'ATTA-CORE-0005',
                 'o Termo de Autorização é do profissional, não do atendimento');
select throws_ok($$ select * from private.appointment_link_documents('00000000-0000-4000-8000-0000000031a1',
                      array['00000000-0000-4000-8000-000000003105']::uuid[]) $$, 'P0002', 'ATTA-CORE-0005',
                 'modelo de outra clínica não vincula');
select throws_ok($$ select * from private.appointment_link_documents('00000000-0000-4000-8000-0000000031a1', '{}') $$,
                 'P0001', 'ATTA-IN-0001', 'lista vazia é recusada');
select is(pg_temp.detalhe($$ select * from private.appointment_link_documents('00000000-0000-4000-8000-0000000031a2',
                             array['00000000-0000-4000-8000-000000003101']::uuid[]) $$), 'person_id',
          'paciente provisório da importação: vincula quando o check-in o identificar');
select set_config('request.jwt.claims', json_build_object('tenant_id', '00000000-0000-4000-8000-0000000003b1')::text, true);
select throws_ok($$ select * from private.appointment_link_documents('00000000-0000-4000-8000-0000000031a1',
                      array['00000000-0000-4000-8000-000000003101']::uuid[]) $$, 'P0002', 'ATTA-CORE-0005',
                 'token de outra clínica: "não encontrado"');
select is((select count(*)::int from private.appointment_terms_pending('00000000-0000-4000-8000-0000000031a1')), 0,
          'token de outra clínica não lê as pendências');
select set_config('request.jwt.claims', '', true);

-- pendências e trava --------------------------------------------------------------------------------------------------
select results_eq($$ select title from private.appointment_terms_pending('00000000-0000-4000-8000-0000000031a1') $$,
                  $$ values ('TCLE fictício') $$, 'só o obrigatório não assinado é pendência (opcional não trava, RN-B-02)');
select is(private.appointment_terms_ready('00000000-0000-4000-8000-0000000031a1'), false, 'com pendência, não está pronto');
select pg_temp.mover('00000000-0000-4000-8000-0000000031a1', 'em_preenchimento');
select is(pg_temp.detalhe($$ select pg_temp.mover('00000000-0000-4000-8000-0000000031a1', 'pronto') $$), 'documents',
          'RN-CHK-02: não libera (Pronto) com obrigatório sem assinatura');
select pg_temp.assinar(pg_temp.doc('00000000-0000-4000-8000-0000000031a1', '00000000-0000-4000-8000-000000003101'), 'pre_assinado');
select is(private.appointment_terms_ready('00000000-0000-4000-8000-0000000031a1'), true, 'obrigatório Pré-assinado: pronto');
select lives_ok($$ select pg_temp.mover('00000000-0000-4000-8000-0000000031a1', 'pronto') $$, 'libera com o obrigatório Pré-assinado');

-- conclusão -----------------------------------------------------------------------------------------------------------
select pg_temp.mover('00000000-0000-4000-8000-0000000031a1', 'em_atendimento');
select pg_temp.mover('00000000-0000-4000-8000-0000000031a1', 'concluido');
select is((select status from documents.document
           where id = pg_temp.doc('00000000-0000-4000-8000-0000000031a1', '00000000-0000-4000-8000-000000003101')),
          'assinado_definitivo', '§10.2.3: na conclusão, Pré-assinado vira Assinado definitivo');
select ok((select status = 'aguardando_assinatura' and auto_excluded_at is not null from documents.document
           where id = pg_temp.doc('00000000-0000-4000-8000-0000000031a1', '00000000-0000-4000-8000-000000003102')),
          'opcional sem assinatura: excluído automaticamente na conclusão, com a marca');
select is(pg_temp.eventos('document.finalize', '00000000-0000-4000-8000-0000000031a1')
          + pg_temp.eventos('document.auto_exclude', '00000000-0000-4000-8000-0000000031a1'), 2,
          'consolidação e exclusão automática vão à trilha');
select is(pg_temp.detalhe(format('update documents.document set status = %L where id = %L', 'pre_assinado',
                                 pg_temp.doc('00000000-0000-4000-8000-0000000031a1', '00000000-0000-4000-8000-000000003102'))),
          'document_status', 'excluído automaticamente não volta a ser assinável');
select is(pg_temp.detalhe($$ select * from private.appointment_link_documents('00000000-0000-4000-8000-0000000031a1',
                             array['00000000-0000-4000-8000-000000003102']::uuid[]) $$), 'status',
          'atendimento concluído não recebe termo novo');

-- recusa: trava a liberação, não a conclusão ---------------------------------------------------------------------------
select private.appointment_link_documents('00000000-0000-4000-8000-0000000031a6', array['00000000-0000-4000-8000-000000003101']::uuid[]);
select pg_temp.assinar(pg_temp.doc('00000000-0000-4000-8000-0000000031a6', '00000000-0000-4000-8000-000000003101'), 'recusado');
select pg_temp.mover('00000000-0000-4000-8000-0000000031a6', 'em_preenchimento');
select is(pg_temp.detalhe($$ select pg_temp.mover('00000000-0000-4000-8000-0000000031a6', 'pronto') $$), 'documents',
          'RN-CHK-02: obrigatório recusado não libera (Pronto)');
-- no Boarding Check (depois de liberar), o termo vinculado e recusado não impede concluir
select pg_temp.mover('00000000-0000-4000-8000-0000000031a4', 'em_preenchimento');
select pg_temp.mover('00000000-0000-4000-8000-0000000031a4', 'pronto');
select pg_temp.mover('00000000-0000-4000-8000-0000000031a4', 'em_atendimento');
select private.appointment_link_documents('00000000-0000-4000-8000-0000000031a4', array['00000000-0000-4000-8000-000000003101']::uuid[]);
select pg_temp.assinar(pg_temp.doc('00000000-0000-4000-8000-0000000031a4', '00000000-0000-4000-8000-000000003101'), 'recusado');
select lives_ok($$ select pg_temp.mover('00000000-0000-4000-8000-0000000031a4', 'concluido') $$,
                '§10.2.3: termo recusado não impede a conclusão');
select ok((select status = 'recusado' and auto_excluded_at is not null from documents.document
           where id = pg_temp.doc('00000000-0000-4000-8000-0000000031a4', '00000000-0000-4000-8000-000000003101')),
          'o recusado é excluído automaticamente na conclusão');

-- cancelamento em cascata ---------------------------------------------------------------------------------------------
select private.appointment_link_documents('00000000-0000-4000-8000-0000000031a3',
  array['00000000-0000-4000-8000-000000003101', '00000000-0000-4000-8000-000000003102']::uuid[]);
select pg_temp.assinar(pg_temp.doc('00000000-0000-4000-8000-0000000031a3', '00000000-0000-4000-8000-000000003101'), 'pre_assinado');
select pg_temp.mover('00000000-0000-4000-8000-0000000031a3', 'cancelado', 'cancelado_pela_clinica');
select results_eq($$ select status, cancel_reason from documents.document
                    where appointment_id = '00000000-0000-4000-8000-0000000031a3' order by id $$,
                  $$ values ('cancelado', 'cancelado_pela_clinica'), ('cancelado', 'cancelado_pela_clinica') $$,
                  '§10.2.2: cancelar o agendamento cancela os termos não definitivos, com o mesmo motivo');
select is(pg_temp.eventos('document.cancel', '00000000-0000-4000-8000-0000000031a3'), 2, 'cada cancelamento vai à trilha');

-- restaurar -----------------------------------------------------------------------------------------------------------
select private.appointment_link_documents('00000000-0000-4000-8000-0000000031a5', array['00000000-0000-4000-8000-000000003101']::uuid[]);
select pg_temp.assinar(pg_temp.doc('00000000-0000-4000-8000-0000000031a5', '00000000-0000-4000-8000-000000003101'), 'recusado');
select results_eq($$ select created from private.appointment_link_documents('00000000-0000-4000-8000-0000000031a5',
                       array['00000000-0000-4000-8000-000000003101']::uuid[]) $$, $$ values (true) $$,
                  '"Restaurar" (§10.2.3): depois da recusa, o modelo pode voltar como documento novo');
select is((select count(*)::int from documents.document where appointment_id = '00000000-0000-4000-8000-0000000031a5'), 2,
          'o recusado continua registrado ao lado do novo');
select pg_temp.assinar(pg_temp.doc('00000000-0000-4000-8000-0000000031a5', '00000000-0000-4000-8000-000000003101'), 'pre_assinado');
select pg_temp.mover('00000000-0000-4000-8000-0000000031a5', 'em_preenchimento');
select lives_ok($$ select pg_temp.mover('00000000-0000-4000-8000-0000000031a5', 'pronto') $$,
                'recusado e depois restaurado e Pré-assinado: libera pelo documento novo');

-- a lista de motivos do documento cobre todos os do agendamento (o MIG-11 ganhar um motivo novo quebra aqui, não no
-- cancelamento; observação do Backend 6 no #107)
select is((select array_agg(r order by r) from (
             select (regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g'))[1] as r
             from pg_constraint c where c.conname = 'appointment_cancel_reason_check'
               and c.conrelid = 'atta_in.appointment'::regclass) x
           where r <> 'cancelado' and r not in (
             select (regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g'))[1]
             from pg_constraint c where c.conname = 'document_cancel_reason_check'
               and c.conrelid = 'documents.document'::regclass)),
          null, 'todo motivo de cancelamento do agendamento é aceito no documento');

-- ninguém apaga -------------------------------------------------------------------------------------------------------
select is(pg_temp.detalhe($$ delete from documents.document where appointment_id = '00000000-0000-4000-8000-0000000031a3' $$),
          'document_delete', 'documento não se apaga, nem cancelado');

select * from finish();
rollback;
