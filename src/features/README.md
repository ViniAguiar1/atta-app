# features

Uma pasta por módulo (`agenda`, `configuracoes`, `pacientes`, `documentos`, `checkin`…), com `components/`, `actions.ts`, `queries.ts`, `schema.ts` (Zod) e os testes ao lado. Feature não importa de outra feature: o que é comum sobe para `src/components/` ou `src/lib/` (ADR 0001 §4).
