# integracoes

Integrações externas do ATTA (MIG-30 a MIG-34, trilha Integrações), sempre atrás de uma **porta** com dois adaptadores: o real e o **simulador**. O padrão é o simulador; o real liga por variável de ambiente e, sem a chave, o servidor não sobe. Desenho completo: `docs/integracoes/DESENHO.md`.

- `mensageria/`: e-mail, WhatsApp e SMS. Só modelos do catálogo fechado (`modelos.ts`): nenhum texto livre, e cada variável tem tipo validado (RN-NOT-01, RN-AGN-CONV-04).
- `comum/`: resultado com o tipo da falha (transitória, permanente ou de configuração), sem dado pessoal na mensagem.
