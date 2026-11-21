-- Dados fictícios do ambiente local e do CI (ADR 0001 §3): só CPF e CNPJ gerados para teste e nomes inventados.
-- Nunca vai para a nuvem (o `db push` não roda seed). Cada trilha acrescenta o seu.

-- ---------------------------------------------------------------------------------------------------------------
-- MIG-03: uma clínica e as pessoas do login, para o `pnpm dev` e o e2e. Senha de todas: Senha-Ficticia-123 (só local).
--   gestora.ficticia@exemplo.test      ADMIN, com TOTP já ativo (segredo abaixo: o e2e calcula o código)
--   admin.novo.ficticio@exemplo.test   ADMIN sem TOTP (o primeiro acesso cai na ativação)
--   colaboradora.ficticia@exemplo.test COLABORADOR (TOTP opcional)
--   convidado.ficticio@exemplo.test    sem clínica (cai em /sem-clinica)
--   gestora.beta.ficticia@exemplo.test ADMIN da 2ª clínica (isolamento entre clínicas)
--   recupera.ficticia@exemplo.test     COLABORADOR do e2e do "Esqueci a senha" (a senha dela muda no teste)
-- Nomes de clínica e de pessoa sem termo de ambiente: aparecem na tela, como na produção.
-- Os ids começam em eeee para não cruzar com os dos testes pgTAP.
-- ---------------------------------------------------------------------------------------------------------------
-- Razão social e CNPJ fictícios (CNPJ gerado, dígitos verificadores válidos), para o Termo de Autorização (MIG-02).
insert into platform.tenant (id, name, legal_name, cnpj) values
  ('eeee0000-0000-4000-8000-000000000001', 'Clínica Alfa Estética', 'Alfa Serviços de Estética Ltda.', '63049587000143'),
  ('eeee0000-0000-4000-8000-000000000002', 'Clínica Beta Dermatologia', 'Beta Clínica Dermatológica Ltda.', '74150698000168');

with pessoa (id, email, nome) as (
  values
    ('eeee0000-0000-4000-8000-0000000000a1'::uuid, 'gestora.ficticia@exemplo.test', 'Helena Prado'),
    ('eeee0000-0000-4000-8000-0000000000a2'::uuid, 'admin.novo.ficticio@exemplo.test', 'Otávio Lins'),
    ('eeee0000-0000-4000-8000-0000000000c1'::uuid, 'colaboradora.ficticia@exemplo.test', 'Rafaela Moura'),
    ('eeee0000-0000-4000-8000-0000000000f5'::uuid, 'convidado.ficticio@exemplo.test', 'Caio Brandão'),
    ('eeee0000-0000-4000-8000-0000000000b1'::uuid, 'gestora.beta.ficticia@exemplo.test', 'Lívia Castro'),
    ('eeee0000-0000-4000-8000-0000000000c2'::uuid, 'recupera.ficticia@exemplo.test', 'Marta Siqueira')
), usuario as (
  -- os campos de token vazios (e não nulos) são o que o Auth espera de um usuário criado fora da API
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current, phone_change, phone_change_token,
    reauthentication_token)
  select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
    extensions.crypt('Senha-Ficticia-123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', nome), now(), now(),
    '', '', '', '', '', '', '', ''
  from pessoa
  returning id, email
)
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, 'email',
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), now(), now(), now()
from usuario;

-- a1 e b1 são os titulares (is_owner, MIG-06); a2 é o gestor adicional da clínica 1 (no máximo 2 ADMIN, §10.4.3)
insert into platform.membership (tenant_id, user_id, app_role, is_owner) values
  ('eeee0000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-0000000000a1', 'ADMIN', true),
  ('eeee0000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-0000000000a2', 'ADMIN', false),
  ('eeee0000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-0000000000c1', 'COLABORADOR', false),
  ('eeee0000-0000-4000-8000-000000000002', 'eeee0000-0000-4000-8000-0000000000b1', 'ADMIN', true),
  ('eeee0000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-0000000000c2', 'COLABORADOR', false);

-- TOTP da gestora, já verificado. Segredo fictício e público (base32), igual ao de e2e/totp.ts.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values ('eeee0000-0000-4000-8000-0000000000fa', 'eeee0000-0000-4000-8000-0000000000a1', 'Autenticador fictício',
  'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP');

-- ---------------------------------------------------------------------------------------------------------------
-- MIG-43: pacientes fictícios para a lista de Pacientes (Frontend 3). CPFs gerados (dígito verificador válido, ninguém
-- real), nomes e contatos inventados. O cpf_hmac usa o pepper de TESTE e o cpf_enc/phone_enc/email_enc a KEK de TESTE
-- (tests/fixtures/cofre-ci.ts: CI_TEST_CPF_PEPPER_HEX e CI_TEST_KEYRING), as mesmas do job de e2e e do .env.local; o
-- teste src/server/pacientes/seed.test.ts confere que abrem. Envelope pela ADR 0002 §6: DEK com ('', network.person,
-- dek, id) e cada valor com columnAad('', network.person, coluna, id). Alfa: 5 pacientes (um sem CPF, incompleto);
-- Beta: 1 paciente só dela, para provar o isolamento.
-- ---------------------------------------------------------------------------------------------------------------
insert into network.person (id, cpf_hmac, cpf_masked, cpf_enc, full_name, social_name, birth_date, phone_enc, email_enc,
  dek_wrapped, kek_version, is_incomplete) values
  ('eeee0000-0000-4000-8000-000000000101', '\xf2ad559ea646073175cf17b3c7661e52919aba38f705dc28a4823e0d6e275be2', '···.···.247-25', '\x010001f35a87c75117f2648a306bd5edbfa22694ecd63770498563727e5643eb465fb4f649781a057d33', 'Juliana Prates', null, date '1990-09-17', '\x010001c5282e0e9e41e457d8b42552607a4a74a4598462a36f9d723262b19c4144cdc9a53447d6846270', '\x010001e59b13405537cb0020686df3344efb9aeb5fb0f795da48200997b8cf4a35c973a5e533e4b1517e54c9fab313e61e3f0e5d9b871730ab4b', '\x0100019559a644fd422a4847548328da0e22a5f92d12244e5d5f516e64a045994f9eb05e4ac9c4663c0400185633caa22ad78f9ea27367b5fbd170187280f8', 1, false),
  ('eeee0000-0000-4000-8000-000000000102', '\xe2d184aa9d1f83f5dc9007dd69e696562a7f8518d8e37d3ef5a8792cc93acc33', '···.···.777-35', '\x0100010bbccf7aa395e6e577fbb7a96b6b11895b4e849f86924666eb970973f44405f6320fe39be3aec5', 'Carlos Siqueira', 'Carla Siqueira', date '1982-01-30', '\x0100013c7c8c7960b10e8c549ac74162f2b5796e151a7c2aec3f3a12e640cd442c8e3990725a9025ae23', null, '\x0100018808a838b199dab460f5e664f0fa2c9acc009e54c020ae2de19c07cf563dd26932999d699e9d41db7566629cf7e88751c43a9b9f07557bcb1e96cd1c', 1, false),
  ('eeee0000-0000-4000-8000-000000000103', '\xef2b8a2ab045ee3c1fdba03f593e3d77c3a963aae3dcc5feca4944f5049f2ef8', '···.···.447-05', '\x010001e82c1497e4ee1beafdbe03f3f238dac60f25210ba72e60eec3b24eaf3c2f9a4db49c314b218fbf', 'Eduardo Lima', null, null, null, null, '\x0100015176c276b8b487bd18a40a273dcd97c2749b2e2aa060c4a5b6d344be86df1cb40480d23168ba554ed414bf34f73c4d92a58c696c2edb3b7d94c8c874', 1, false),
  ('eeee0000-0000-4000-8000-000000000104', '\x360ccfbbcbb9a3048172c2c308a173bdfd41b37a75649874318fca8f06ca56e5', '···.···.090-71', '\x010001dcd763c0697e3297b2c2c2cdf918c073665a35978bd8e835ecce4c2e84cfea5fb71d0d8923d3c7', 'Alana Duarte', null, date '1994-07-02', null, '\x01000198fada2c8fa21c9f1261db71d21f18762cbda258f306e8d3e5fb7e7c590c544d7e410578d375ad6877cf4e3d72f7810fd0f9e2808c', '\x0100012572929d8ef8d815e95319e925b18deb9c526de840031525dfe1fae983aa4217ac463bbaefd644e30a601aee487f7734e2fda914756f5e9a48f1a5a0', 1, false),
  ('eeee0000-0000-4000-8000-000000000105', null, null, null, 'Fábio Moreira', null, date '2012-05-12', '\x01000186e1d685e6cc3dc592adc0b15000a8ac723c4656e80f1cec2d4a4b55298700b9a1ba41b3f133a6', null, '\x01000145c8862542e294fc95ccb87e68b6e0e665ae82903fbe106054e497c36511c3bc58e314c5525ecfa4352da4ef8662a9aab4cc9effeaeb9f96d0964e03', 1, true),
  ('eeee0000-0000-4000-8000-000000000106', '\xd343a4b4f3a1f073f350bd23a6594a96c459313bab394ce42b0ff432dc00d36f', '···.···.690-22', '\x010001ab83267bf120ae05754a3c7506997bd84940b3edb11cf9259ba79bfa3e2ab943db6c5cce795ca2', 'Otávio Ramos', null, date '1979-03-11', '\x0100011b9529b3e92c57517fc902bb1d65d35a4b56e5fa71924335e1c68f524c8720b06fc6bb0e0b09ee', null, '\x010001159aa8684a733e7fdbb0075cfce80d6bee822b2c9ce9541533b127e7a3502c3ebe0869f0c9d47379b9ac6d219818d5c5900577e01ad0c67aaf3fa799', 1, false);

insert into network.person_tenant_link (tenant_id, person_id, origin) values
  ('eeee0000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-000000000101', 'recepcao'),
  ('eeee0000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-000000000102', 'recepcao'),
  ('eeee0000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-000000000103', 'recepcao'),
  ('eeee0000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-000000000104', 'importacao'),
  ('eeee0000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-000000000105', 'recepcao'),
  ('eeee0000-0000-4000-8000-000000000002', 'eeee0000-0000-4000-8000-000000000106', 'recepcao');

-- ---------------------------------------------------------------------------------------------------------------
-- MIG-11: agenda de HOJE da Clínica Alfa, para a tela da Agenda e o e2e com a porta real (pedido do Frontend 4).
-- Horários relativos à hora do reset, presos ao dia de hoje no fuso da clínica (a agenda nunca abre vazia; perto da
-- meia-noite eles se apertam no começo ou no fim do dia). Reaproveita os pacientes do MIG-43; o provisório da importação
-- e a profissional são novos, com CPF gerado e cifrados com a KEK e o pepper de TESTE (tests/fixtures/cofre-ci.ts),
-- pela ADR 0002 §6: provisório com DEK (clínica, network.person_import_provisional, dek, id); profissional, dado de rede,
-- com DEK ('', platform.professional, dek, id); vínculo com DEK (clínica, platform.professional_tenant_link, dek,
-- envelope_id). Nenhum documento vinculado: todos aparecem sem documento.
--   Juliana Prates (CPF 529.982.247-25, para a busca pelo CPF inteiro) Agendado atrasado  · Cancelado mais tarde
--   Carlos Siqueira                                                   Agendado, procedimento sem documento
--   Beatriz Lima (provisória, CPF 353.798.388-39)                     Em preenchimento
--   Eduardo Lima                                                      Pronto
--   Alana Duarte                                                      Em atendimento
--   Fábio Moreira (cadastro incompleto)                               Ausente
--   Carlos Siqueira, mais cedo                                        Concluído (visão Concluídos)
-- ---------------------------------------------------------------------------------------------------------------
insert into network.person_import_provisional (id, tenant_id, import_batch_id, cpf_hmac, cpf_masked, cpf_enc, full_name,
  dek_wrapped, kek_version) values
  ('eeee0000-0000-4000-8000-000000000201', 'eeee0000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-000000000200', '\x661d86ae5c01c44623d5053b1bf37142d6f9511071d411273d10f5cf0606eaf7', '···.···.388-39', '\x01000161eaa934950115420f257611cf7bb71a7ce85fce3ef177c5e7a53a759edad1752c327759bebf6f', 'Beatriz Lima', '\x010001dd2dba77fdbecd9006413bc081f354ccddf6cd9c4c07f211f7c58ed315eb6ea56fbcd619d284af94c45bef7a0aa6616b20025126f75680a55c222da5', 1);

insert into platform.professional (id, display_name, council, council_uf, council_number, cpf_hmac, cpf_masked, cpf_enc,
  email_enc, email_hmac, dek_wrapped, kek_version, council_status, council_verified_at) values
  ('eeee0000-0000-4000-8000-000000000301', 'Dra. Renata Albuquerque', 'crm', 'SP', '000123', '\xe6bfaf1c454a826d64825bc48c40d5d4306a3eea436dd3bbf03468c2b1f356b6', '···.···.938-60', '\x0100017cf703884814b18372c7dfffcf92a4525cec678cfa560037e95de996c05d66ef229299c5530564', '\x010001139014a515fe36ee33bef9473d837399283f777b5f59389178241f6a3710eb5588a53504241c8924a5047b784c7a8a2a1b4b7541916169f538a2be', '\x77c4c915fadc4a17c69d8328e75ceb3425bd0ff543f3bd751cf0e925f670b799', '\x0100016c3b0715c06fde07e9e1113db2dd43d634c7c67963515e001ffde33efb27d6f7a27364bb2dbcd47453f3572c3f31fad60be3064a450c5787eb53d73e', 1, 'regularizado', now());

insert into platform.professional_tenant_link (id, tenant_id, professional_id, invite_email_hmac, invite_email_enc,
  envelope_id, dek_wrapped, kek_version, propass_completed_at, privacy_notice_version, privacy_notice_ack_at) values
  ('eeee0000-0000-4000-8000-000000000311', 'eeee0000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-000000000301', '\x77c4c915fadc4a17c69d8328e75ceb3425bd0ff543f3bd751cf0e925f670b799', '\x01000138ed5014978c72cd2e74fa7261685b47bdceb58a1b23823a5ad9addfda072b5f6186313db8fab9cac51c6f65ef8b58e2dcd6ef3d328bf0cb918ffe', 'eeee0000-0000-4000-8000-000000000312', '\x010001cf0b4ed20f4e3e090d709044dc6d5c2afbb45a4f3008850cb55bec9cf949113a058d7b8ac0adf3da0e7d08da4e9cfbecc23ee8957b3b1ff987ddcdcb', 1, now(), 'v1', now());

insert into atta_in.clinic_service (id, tenant_id, name, duration_min) values
  ('eeee0000-0000-4000-8000-000000000401', 'eeee0000-0000-4000-8000-000000000001', 'Limpeza de pele', 60);
insert into atta_in.professional_service (tenant_id, professional_link_id, clinic_service_id) values
  ('eeee0000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-000000000311', 'eeee0000-0000-4000-8000-000000000401');

do $$
declare
  v_tenant constant uuid := 'eeee0000-0000-4000-8000-000000000001';
  v_link constant uuid := 'eeee0000-0000-4000-8000-000000000311';
  v_inicio timestamptz;
  v_fim timestamptz;
  r record;
begin
  select date_trunc('day', now() at time zone t.timezone) at time zone t.timezone into v_inicio
  from platform.tenant t where t.id = v_tenant;
  v_fim := v_inicio + interval '1 day' - interval '5 minutes';
  for r in select * from (values
    ('eeee0000-0000-4000-8000-000000000501'::uuid, 'eeee0000-0000-4000-8000-000000000101'::uuid, null::uuid, 'consulta', interval '-40 minutes'),
    ('eeee0000-0000-4000-8000-000000000502', 'eeee0000-0000-4000-8000-000000000102', null, 'procedimento', interval '30 minutes'),
    ('eeee0000-0000-4000-8000-000000000503', null, 'eeee0000-0000-4000-8000-000000000201', 'consulta', interval '-10 minutes'),
    ('eeee0000-0000-4000-8000-000000000504', 'eeee0000-0000-4000-8000-000000000103', null, 'consulta', interval '-20 minutes'),
    ('eeee0000-0000-4000-8000-000000000505', 'eeee0000-0000-4000-8000-000000000104', null, 'avaliacao', interval '-30 minutes'),
    ('eeee0000-0000-4000-8000-000000000506', 'eeee0000-0000-4000-8000-000000000105', null, 'consulta', interval '-60 minutes'),
    ('eeee0000-0000-4000-8000-000000000507', 'eeee0000-0000-4000-8000-000000000101', null, 'consulta', interval '60 minutes'),
    ('eeee0000-0000-4000-8000-000000000508', 'eeee0000-0000-4000-8000-000000000102', null, 'procedimento', interval '-120 minutes')
  ) a (id, person_id, provisional_id, tipo, desvio)
  loop
    insert into atta_in.appointment (id, tenant_id, person_id, provisional_patient_id, professional_link_id,
      appointment_type, starts_at, ends_at)
    values (r.id, v_tenant, r.person_id, r.provisional_id, v_link, r.tipo,
      least(greatest(now() + r.desvio, v_inicio), v_fim), least(greatest(now() + r.desvio, v_inicio), v_fim) + interval '1 hour');
  end loop;
  -- todos com o Serviço, para a coluna Procedimento não sair vazia (Frontend 4, ao ligar a Agenda); sem modelo de documento
  -- no seed, todos continuam sem documento
  insert into atta_in.appointment_clinic_service (tenant_id, appointment_id, clinic_service_id)
  select v_tenant, a.id, 'eeee0000-0000-4000-8000-000000000401'
  from atta_in.appointment a where a.tenant_id = v_tenant and a.id::text like 'eeee0000-0000-4000-8000-0000000005%';

  -- os estados pela máquina de estados (a mesma função das ações da recepção e do check-in)
  perform atta_in.apply_transition('eeee0000-0000-4000-8000-000000000503', v_tenant, 'em_preenchimento');
  perform atta_in.apply_transition('eeee0000-0000-4000-8000-000000000504', v_tenant, 'em_preenchimento');
  perform atta_in.apply_transition('eeee0000-0000-4000-8000-000000000504', v_tenant, 'pronto');
  perform atta_in.apply_transition('eeee0000-0000-4000-8000-000000000505', v_tenant, 'em_preenchimento');
  perform atta_in.apply_transition('eeee0000-0000-4000-8000-000000000505', v_tenant, 'pronto');
  perform atta_in.apply_transition('eeee0000-0000-4000-8000-000000000505', v_tenant, 'em_atendimento');
  perform atta_in.apply_transition('eeee0000-0000-4000-8000-000000000506', v_tenant, 'ausente', null, false, 'manual');
  perform atta_in.apply_transition('eeee0000-0000-4000-8000-000000000507', v_tenant, 'cancelado', 'cancelado_pelo_paciente');
  perform atta_in.apply_transition('eeee0000-0000-4000-8000-000000000508', v_tenant, 'em_preenchimento');
  perform atta_in.apply_transition('eeee0000-0000-4000-8000-000000000508', v_tenant, 'pronto');
  perform atta_in.apply_transition('eeee0000-0000-4000-8000-000000000508', v_tenant, 'em_atendimento');
  perform atta_in.apply_transition('eeee0000-0000-4000-8000-000000000508', v_tenant, 'concluido');
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- MIG-14b: um convite de PROpass pendente na Clínica Alfa, para o e2e do fluxo completo no CI e o `pnpm dev` (pedido do
-- Frontend 6; regra do CTO, 21/11). Segredo FIXO e conhecido (o repo é público), em tests/fixtures/propass-convite-local.ts;
-- aqui só o sha256 dele. Vale só no local e no CI: o e-mail do convite está cifrado com a KEK de TESTE, que a prévia e a
-- produção recusam, e src/server/propass/seed-local.test.ts prova as travas. Na nuvem, o convite de teste sai só do
-- scripts/seed-nuvem/convite-propass.ts (Backend 1), com validade curta e uso único.
-- Vínculo sem profissional (o PROpass o cria); e-mail convite.propass.ficticio@exemplo.test;
-- envelope pela ADR 0001 §1 e 0002 §6 (DEK com (clínica, platform.professional_tenant_link, dek, envelope_id)), pelo
-- selarConvite do app. O link sai pela private.propass_issue, a mesma do convite do painel: uso único, 7 dias do reset.
-- ---------------------------------------------------------------------------------------------------------------
insert into platform.professional_tenant_link (id, tenant_id, invite_email_hmac, invite_email_enc, envelope_id,
  dek_wrapped, kek_version) values
  ('eeee0000-0000-4000-8000-000000000321', 'eeee0000-0000-4000-8000-000000000001', '\xc6fe373cd89e70a50451d6c288f394cc02b8f65b63428b5e3ae6ffc426071063', '\x010001873a463555b45040ae09ac6e3c2e11e44b7126d9a381ee2ae9db8cb3934e30eb303479cb1f3de7d3ee777237fdd7d7c25ee7e7533df84ba102bf0c529f65103308', 'eeee0000-0000-4000-8000-000000000322', '\x01000136d2b437af7b6333ee2fffc778c8f926e2570115a2512d0c0942ec6cf599f08964184f4e456cd7e713cb39e1ced410e2b0430bc9ddf0b287da450ae7', 1);

select private.propass_issue('eeee0000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-000000000321',
  '\xaf178a5f8eb71983f61a109ae84377bdf7a06bbee169d70b5067d7ad57ec97fe'::bytea);

-- ---------------------------------------------------------------------------------------------------------------
-- MIG-21: chave de selo de TESTE do ATTA Sign (pública e fictícia, tests/fixtures/selo-ci.ts), para o e2e do PROpass
-- assinar o Termo de Autorização no local e no CI (pedido do Frontend 6; contrato do Tech Lead, 21/11). Só aqui no
-- seed: nunca em migration nem em scripts/seed-nuvem, e o servidor a recusa na prévia e na produção (chaveDoAmbiente).
-- ---------------------------------------------------------------------------------------------------------------
insert into documents.seal_key (kid, public_key_spki, valid_from)
values ('staging-seal-ci-teste', '\x302a300506032b6570032100985fbf55b622f0072959e4d53a9c52d0729b6dc42027c153db8b90ecfea96834', '2026-01-01T00:00:00Z')
on conflict (kid) do nothing;
