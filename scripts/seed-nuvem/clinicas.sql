-- Razão social e CNPJ FICTÍCIOS das clínicas do stage (decisão do CTO, 21/11), para o Termo de Autorização do PROpass
-- real. CNPJ gerado (dígitos verificadores válidos), nenhum dado real. Só o Backend 1 aplica, na nuvem, depois do merge:
--   psql … -v ON_ERROR_STOP=1 -1 -f scripts/seed-nuvem/clinicas.sql
-- Idempotente: só preenche o que ainda está vazio (não sobrescreve o que o Perfil da Clínica gravar depois).
update platform.tenant set legal_name = coalesce(legal_name, 'Aurora Serviços de Estética Ltda.'),
                           cnpj = coalesce(cnpj, '41827365000171')
where id = '0a770000-0000-4000-8000-000000000001';
update platform.tenant set legal_name = coalesce(legal_name, 'Serena Clínica Integrada Ltda.'),
                           cnpj = coalesce(cnpj, '52938476000171')
where id = '0a770000-0000-4000-8000-000000000002';
