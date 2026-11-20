# server

Código que só roda no servidor do Next, em runtime **Node** (nunca Edge). Cada arquivo começa com `import "server-only"`.
É um dos lugares onde o ESLint deixa importar `@/lib/supabase/admin` e `@/lib/env.server` (ADR 0001 §4).

- `cofre/`: cifra por envelope do Formulário de Saúde (MIG-22, Backend 3; ADR 0002).
