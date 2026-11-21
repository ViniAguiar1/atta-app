# integracoes

Integrações externas do ATTA (MIG-30 a MIG-34, trilha Integrações), sempre atrás de uma **porta** com dois adaptadores: o real e o **simulador**. O padrão é o simulador; o real liga por variável de ambiente e, sem a chave, o servidor não sobe. Desenho completo: `docs/integracoes/DESENHO.md`.

- `mensageria/`: e-mail, WhatsApp e SMS. Só modelos do catálogo fechado (`modelos.ts`): nenhum texto livre, e cada variável tem tipo validado (RN-NOT-01, RN-AGN-CONV-04).
- `email/`: adaptador da Resend (envio com chave de idempotência e webhook no padrão Svix).
- `whatsapp/`: adaptador da Cloud API da Meta (MIG-31): só modelos aprovados, código no botão de copiar, webhook com `X-Hub-Signature-256` e cobrança por `pricing.type`.
- `mensageria/montagem.ts`: escolhe simulador ou real por variável de ambiente.
- `mensageria/envio-permitido.ts`: enquanto a nuvem só tem dado fictício, todo provedor real só envia para destino cujo HMAC está em `ATTA_ENVIO_PERMITIDOS`; o resto volta como `bloqueado_stage`, e `@exemplo.test` nunca sai (ADR 0005 §1).
- `agenda/`: porta da agenda externa da clínica (Google Agenda e Outlook, PDD §10.4.5), OAuth com PKCE, só leitura, e o simulador (MIG-33).
- `comum/`: `ResultadoProvedor`, o resultado interno dos adaptadores, com o tipo da falha (transitória, permanente ou de configuração) e sem dado pessoal; não sai desta pasta (o das bordas é o de `@/lib/errors`, ADR 0005 §3).
- O destinatário entra por referência (pessoa, paciente provisório, profissional ou membro); o endereço é resolvido no servidor (ADR 0005 §1).
