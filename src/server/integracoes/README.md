# integracoes

Integrações externas do ATTA (MIG-30 a MIG-34, trilha Integrações), sempre atrás de uma **porta** com dois adaptadores: o real e o **simulador**. O padrão é o simulador; o real liga por variável de ambiente e, sem a chave, o servidor não sobe. Desenho completo: `docs/integracoes/DESENHO.md`.

- `mensageria/`: e-mail, WhatsApp e SMS. Só modelos do catálogo fechado (`modelos.ts`): nenhum texto livre, e cada variável tem tipo validado (RN-NOT-01, RN-AGN-CONV-04).
- `comum/`: `ResultadoProvedor`, o resultado interno dos adaptadores, com o tipo da falha (transitória, permanente ou de configuração) e sem dado pessoal; não sai desta pasta (o das bordas é o de `@/lib/errors`, ADR 0005 §3).
- O destinatário entra por referência (pessoa, paciente provisório, profissional ou membro); o endereço é resolvido no servidor (ADR 0005 §1).
