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
insert into platform.tenant (id, name) values
  ('eeee0000-0000-4000-8000-000000000001', 'Clínica Alfa Estética'),
  ('eeee0000-0000-4000-8000-000000000002', 'Clínica Beta Dermatologia');

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
