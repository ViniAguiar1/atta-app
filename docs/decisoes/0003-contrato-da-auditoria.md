# ADR 0003: Contrato da auditoria (`audit.record_event`)

- Status: aceita (Tech Lead, 20/11/2026)
- Implementa: Backend 1 (MIG-04). Usam: todas as trilhas, de dentro de funções SECURITY DEFINER e de jobs
- Base: PDD §19.5 (log de acesso e trilha de auditoria), §19.6 (campos mínimos), RN-FIC-03 (leitura de dado sensível é auditada), RN-PAC-03, ADR 0005 §5

## Decisão

### 1. Assinatura
```sql
audit.record_event(
  p_action    text,                       -- do catálogo audit.action; ação desconhecida = erro
  p_entity    text,                       -- 'schema.tabela', ex.: 'network.person'
  p_entity_id uuid,
  p_details   jsonb default '{}'::jsonb,  -- só ids, finalidade e motivo
  p_before    jsonb default null,         -- só em ação do tipo 'change'
  p_after     jsonb default null,
  p_tenant_id uuid  default null          -- só quando o token não tem tenant (job, fluxo do paciente)
) returns uuid                            -- id do evento
```
- **Catálogo fechado `audit.action`**, com as colunas `action text primary key` e `kind text check (kind in ('access','change'))`. Ação nova entra por migration, no PR de quem a usa, e o nome segue `<entidade>.<verbo>` (`patient.search`, `patient.read`, `patient.register`, `patient.update`, `patient.divergence`...). O `kind` separa o log de acesso (leituras) da trilha (mudanças), que têm retenções diferentes (§19.5). Em `access`, `p_before` e `p_after` precisam ser nulos.
- **O que a função preenche sozinha** (§19.6):
  - momento em UTC (`clock_timestamp()`);
  - ator (`auth.uid()`) e papel (`private.current_app_role()`; `system` sem JWT);
  - tenant (`private.current_tenant_id()`);
  - IP de origem e id de correlação, lidos de `request.headers` (`x-forwarded-for`, `x-request-id`; o servidor do Next sempre manda `x-request-id`);
  - o elo do hash encadeado.
- `p_tenant_id`: se o token tem tenant e o parâmetro difere, a função lança erro. Sem tenant em nenhum dos dois, só vale para ação de rede, sem tenant.

### 2. O que pode ir no evento
- `p_details`: nunca CPF (nem o HMAC), nome, telefone, e-mail ou dado de saúde, só ids, finalidade e motivo. A função recusa chaves da lista proibida (`cpf`, `cpf_hmac`, `name`, `full_name`, `social_name`, `email`, `phone`, `nome`, `telefone`).
- `p_before` e `p_after`: só os campos que mudaram. Campo em claro vai com o valor, porque a trilha precisa de anterior e posterior (§19.6). Campo `*_enc` vai como o cifrado em base64, nunca decifrado. Dado de saúde nunca entra, nem cifrado; registra-se só o fato e o id.

### 3. Permissões
- `audit.record_event` é SECURITY DEFINER, pertence à role dona da auditoria (sem login) e tem `search_path = ''`. `EXECUTE` só para a role dona das funções de `api`, `private` e `atta_in` (`postgres`), revogado de `public`, `anon`, `authenticated` e `service_role`. O navegador e a secret key não escrevem na trilha direto: só as funções do banco escrevem.
- Leitura da trilha: só por função em `api`, para ADMIN com `has_permission('audit','view')` e só do próprio tenant (MIG-04/MIG-06).

### 4. Até o MIG-04 entrar
Cada trilha usa um stub local com essa assinatura, fora do git. O MIG-04 entrega a função real, o catálogo e um pgTAP que prova que ação desconhecida, chave proibida e tenant divergente são recusados.
