-- Dados fictícios do ambiente local e do CI (ADR 0001 §3): só CPF e CNPJ gerados para teste e nomes inventados.
-- Nunca vai para a nuvem (o `db push` não roda seed). Cada trilha acrescenta o seu.

-- ---------------------------------------------------------------------------------------------------------------
-- MIG-03: uma clínica e as pessoas do login, para o `pnpm dev` e o e2e. Senha de todas: Senha-Ficticia-123 (só local).
--   gestora.ficticia@exemplo.test      ADMIN, com TOTP já ativo (segredo abaixo: o e2e calcula o código)
--   admin.novo.ficticio@exemplo.test   ADMIN sem TOTP (o primeiro acesso cai na ativação)
--   colaboradora.ficticia@exemplo.test COLABORADOR (TOTP opcional)
--   convidado.ficticio@exemplo.test    sem clínica (cai em /sem-clinica)
--   gestora.beta.ficticia@exemplo.test ADMIN da 2ª clínica (isolamento entre clínicas)
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
    ('eeee0000-0000-4000-8000-0000000000b1'::uuid, 'gestora.beta.ficticia@exemplo.test', 'Lívia Castro')
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

insert into platform.membership (tenant_id, user_id, app_role) values
  ('eeee0000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-0000000000a1', 'ADMIN'),
  ('eeee0000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-0000000000a2', 'ADMIN'),
  ('eeee0000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-0000000000c1', 'COLABORADOR'),
  ('eeee0000-0000-4000-8000-000000000002', 'eeee0000-0000-4000-8000-0000000000b1', 'ADMIN');

-- TOTP da gestora, já verificado. Segredo fictício e público (base32), igual ao de e2e/totp.ts.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values ('eeee0000-0000-4000-8000-0000000000fa', 'eeee0000-0000-4000-8000-0000000000a1', 'Autenticador fictício',
  'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP');
