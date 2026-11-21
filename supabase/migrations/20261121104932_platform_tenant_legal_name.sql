-- MIG-02: razão social da clínica (platform.tenant.legal_name), decisão do CTO em 21/11 para o PROpass real. O Termo
-- de Autorização é "preenchido com a razão social, o CNPJ e o nome da clínica" (P2c), e o payload assinado leva
-- tenant.legal_name. O simulador (captura 42, Perfil da Clínica › Dados da empresa) tem "Razão social", com a ajuda
-- "Como consta no CNPJ", separada do nome fantasia (que é o name).
-- Sem espaço nas pontas (sugestão da Segurança no #235): o servidor grava já aparada.
-- Nula por enquanto: enquanto estiver nula, o servidor não monta nem assina o termo (nunca com a razão social vazia nem
-- com o nome fantasia no lugar). Quem grava: o Perfil da Clínica e o onboarding, que chegam depois, com a escrita
-- (grant de coluna ou função) decidida no PR deles. Aqui, nenhum grant novo: o select do membro já cobre a leitura.
alter table platform.tenant
  add column legal_name text
  constraint tenant_legal_name_check check (legal_name is null or (legal_name = btrim(legal_name) and char_length(legal_name) between 2 and 200));

comment on column platform.tenant.legal_name is 'Razão social, como consta no CNPJ (Perfil da Clínica). Nula até ser informada.';
