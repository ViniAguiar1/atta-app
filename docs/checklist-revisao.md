# Checklist de revisão do atta-app

Quem revisa passa por esta lista antes de comentar "✅ APROVADO (sigla)". Item que não se aplica ao PR é pulado. O que está marcado com **(TL)** exige também o ✅ do Tech Lead.

## Banco
- [ ] Toda tabela nova: `ENABLE` e `FORCE ROW LEVEL SECURITY`, policy canônica `tenant_id = (select private.current_tenant_id())` e grants mínimos, com `REVOKE ALL` antes. **(TL)**
- [ ] Teste pgTAP de cada policy: papel permitido passa, papel negado falha, e outra clínica não vê. **(TL)**
- [ ] Schema certo, de acordo com a ADR 0001: nada de rede em `atta_in`, nada em `public`, e a plataforma não referencia `atta_in`.
- [ ] Função SECURITY DEFINER: em `api` ou `private`, com `set search_path = ''`, `EXECUTE` revogado de `public` e `anon`, checando papel e tenant dentro e registrando em `audit` a leitura de dado pessoal. **(TL)**
- [ ] Uma migration por PR, com timestamp mais novo que o último da `main`, sem editar migration antiga.
- [ ] `database.types.ts` gerado no mesmo PR; o CI confere.
- [ ] Nada liga `log_statement`, `auto_explain` ou log de query lenta com valores.

## Dados pessoais e saúde
- [ ] Nenhum CPF, nome de paciente, telefone, e-mail ou dado de saúde em URL: nem em segmento de rota (`[cpf]`), nem em `searchParams`, nem em filtro do supabase-js (`.eq`, `.ilike`, `.or`). Busca vai por `.rpc()` (POST) ou server action.
- [ ] Nenhum `console.*`; log só pelo `lib/logger.ts`, sem dado pessoal.
- [ ] Resposta de saúde só cifrada pelo `Cofre` (ADR 0002); o banco não decifra; DEK zerada e fora de cache e log. **(TL)**
- [ ] Gestor e Colaborador não têm caminho nenhum até o Formulário de Saúde, nem por função, nem por view. **(TL)**
- [ ] Seeds, testes, prints e PR só com dado fictício (CPF e CNPJ gerados, nomes inventados).

## Stage = produção (regra do dono, 20/11)
- [ ] Nenhum texto de ambiente na interface: "Ambiente de validação", "fictício", "demo", "teste", "simulado", "stage", dica de código ou CPF na tela, rodapé de atalhos, página-marcador. O teste `src/lib/qualidade/termos-proibidos.test.ts` reprova esses textos; exceção nova só com o ok do Tech Lead.
- [ ] A diferença entre stage e produção fica em variável de ambiente e no adaptador (simulador), nunca no texto. Valores para testar vão para `migracao/guia-de-teste.md` (QA).

## Servidor e segredos
- [ ] `SUPABASE_SECRET_KEY` e o `Cofre` só em código de servidor (`server-only`), e o papel é conferido antes de usar a chave. **(TL)**
- [ ] Nenhum valor de chave em código, commit, PR ou `.env` versionado.
- [ ] Entrada validada com Zod; erro no padrão `{ ok:false, error:{ code, message } }`, sem dado pessoal na mensagem.

## Geral
- [ ] PR com até ~400 linhas úteis; lint, typecheck e testes rodados localmente.
- [ ] Prévia da Vercel abrindo e CI verde.
- [ ] Linha final `Autor: … · Revisor: … · QA: …`.
