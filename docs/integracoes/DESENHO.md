# Integrações do ATTA (MIG-30 a MIG-34): desenho

Autor: Integrações. Base: PDD v206 (9.4, 9.6, 10.1, 10.2.1, 10.2.3, 10.4.5, 10.4.6, 10.4.8, 11.4, 11.13, 20, 21, 23, 24), ADR 0022 e ADR 0028 do atta-platform. O PDD manda: onde o ADR 0022 diverge (mapeamento agenda↔profissional), vale o PDD.

## Princípio
Cada integração é uma **porta** (interface TypeScript em `src/server/integracoes/<área>/porta.ts`) com dois adaptadores: o **real** e o **simulador**. O padrão é simulador em todo ambiente; `ATTA_<X>_MODO=real` liga o real, e sem a chave o servidor não sobe (nunca cai em simulador escondido). Tudo só no servidor: nenhuma chave em código que vai ao navegador.

## Fila de envio (base do MIG-30, usada por 31, 32 e 34)
- Tabela `integracoes.envio` no Postgres, com a semântica do ADR 0028: reivindicar com lease (`FOR UPDATE SKIP LOCKED`), tentativa numerada, esperas de 5 s, 30 s e 5 min, falha definitiva na 4ª; falha permanente ou de configuração não repete.
- Idempotência por `(tenant_id, chave_idempotencia)` (PDD 9.6). Webhooks deduplicados em `integracoes.webhook_recebido`.
- **Modelos fechados** (`mensageria/modelos.ts`): não existe texto livre; cada variável tem tipo validado (código de 6 dígitos, URL só dos hosts do ATTA e sem query, nome da clínica, data e hora, evento da lista do 10.4.6). É a trava da RN-NOT-01 (nada de dado de saúde) e da RN-AGN-CONV-04 (nada de dado pessoal em URL).
- **Alternativa de canal**: WhatsApp que falha de vez (no envio ou no retorno de entrega) gera o mesmo envio por SMS (10.2.1, 10.2.3).
- **Validade**: o código de verificação vale 10 min; envio vencido expira e não sai.
- **Pausa noturna** (22h–07h no fuso da clínica) só para alertas da equipe; essenciais ao paciente nunca são suprimidos (RN-NOT-02).
- **Consumo** (10.4.6, LAC-047): cada envio guarda `cobravel` vindo do retorno do provedor; a view `consumo_mensagens_dia` dá o total por dia e tipo.
- **Quem dispara o processamento**: logo após enfileirar um envio `imediata` (código), via `after()` do Next; e a cada minuto pelo `pg_cron` + `pg_net` do Supabase chamando a rota protegida por `ATTA_CRON_SECRET` (independe do plano da Vercel).
- Acesso: RLS forçada nas 3 tabelas; ninguém escreve direto; só funções `SECURITY DEFINER` com `execute` para `service_role`. A clínica lê a view `envio_da_clinica`, com o destino mascarado (só o final do número, 11.4). Testado em Postgres 17 do Supabase descartável.

## MIG-30 E-mail
Resend (API HTTP, `Idempotency-Key`, webhook assinado no padrão Svix). Usos: alertas da equipe, convites, régua de cobrança, relatório da importação e documentos assinados sob pedido (11.13, PDF em anexo). Domínio remetente com SPF, DKIM e DMARC.

## MIG-31 WhatsApp e SMS
WhatsApp Business **Cloud API da Meta, direto** (sem intermediário), só com modelos aprovados: `authentication` para o código (com botão de copiar) e `utility` para link de check-in, lembretes, link de termos, Boarding Check e confirmação. Webhook com `X-Hub-Signature-256`. SMS atrás da mesma porta; o provedor é decisão comercial pendente (só simulador por enquanto).
Política do código (pura e testada): validade de 10 min, 5 erros cancelam, 30 s entre envios, no máximo 3 envios em 15 min.

## MIG-32 Asaas
Cliente por clínica (CNPJ), assinatura **mensal** de R$ 399, e no fechamento do mês a cobrança pendente é ajustada com os itens variáveis discriminados (armazenamento excedente, importação de R$ 39,90, mensagens), numa cobrança só (10.1, 10.4.8). Webhook com o `asaas-access-token`. A régua de inadimplência (D+1, avisos em D+5/15/25, suspensão em D+30, aviso em D+105, cancelamento em D+120) é uma função pura testada; os avisos saem pela fila de e-mail. Só sandbox nesta fase.

## MIG-33 Google Agenda e Outlook
OAuth com PKCE S256, `state` preso à sessão e redirect exato; escopos só de leitura (Google `calendar.calendarlist.readonly` + `calendar.events.owned.readonly`; Microsoft `Calendars.ReadBasic` + `offline_access`). Agenda da clínica, sem mapeamento por profissional (PO, 18/11). Ingestão mínima: início, fim, id e versão; título, descrição, local e participantes nunca são gravados. Refresh token no Vault do Supabase, por conexão; renovação só no job. Sincronização incremental por cursor, frequência 15 min/30 min/1 h/manual. Desconectar revoga no provedor e para a leitura; o que já veio fica.

## MIG-34 Importação de pacientes
Só a planilha modelo `.xlsx`, aba "Pacientes", até 20 MB, 5 colunas; fora do modelo é recusada inteira. Validação pura e testada (CPF por dígito, zero à esquerda que o Excel perde, data em número de série do Excel, celular, e-mail); campo opcional inválido entra em branco; linha sem nome ou CPF vira pendência. Dedupe e vínculo na rede por CPF ficam no serviço de paciente do MIG-12. Arquivo no Storage privado; processamento pela fila de jobs.

## Contratos com as outras trilhas (a combinar com o Tech Lead)
- MIG-15 (regras de notificação, BE2) decide **quem e quando**; a fila do MIG-30 é **como**. A BE2 chama `enfileirar` com modelo e variáveis do catálogo.
- MIG-13/MIG-50 (check-in): proposta de que o código de verificação (gerar, guardar o hash, conferir, limites) fique no MIG-31, para ficar junto do envio e dos limites.
- MIG-02: trocar `integracoes.tenant_do_token()` pela função canônica e seguir o padrão de dono das funções e views.

## Pendências de regra (vão ao CTO)
1. "Até 3 reenvios a cada 15 minutos": li como 3 envios por janela de 15 min; se for 1 envio + 3 reenvios, é 1 parâmetro.
2. Forma de pagamento da mensalidade (boleto, Pix, cartão ou a clínica escolhe): o PDD não diz. Padrão provisório: a clínica escolhe.
3. NFS-e da mensalidade (o PDD cita a NFS-e da importação): quem emite, o Asaas ou outro sistema.
4. Provedor de SMS.
5. E-mail com documento assinado em PDF passa pelo provedor de e-mail (fora do Brasil): conferir com a Andressa antes do primeiro dado real.
