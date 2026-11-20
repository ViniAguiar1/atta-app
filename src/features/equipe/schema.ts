import { z } from "zod";

// Borda do convite de Equipe & Permissões (PDD v206 §10.4.3): o gestor informa nome e e-mail, o nível e, para o
// COLABORADOR, a matriz por módulo (visualiza, cria, edita). Sem matriz, o banco aplica o padrão sugerido do §10.4.3.
// Os pares proibidos (ATTA e Métricas só com visualizar; criar e editar sem visualizar) o banco recusa (23514).

export const MODULOS_DA_MATRIZ = ["appointments", "patients", "documents", "atta", "metrics"] as const;
export const ACOES_DA_MATRIZ = ["view", "create", "edit"] as const;

export const matrizSchema = z.partialRecord(
  z.enum(MODULOS_DA_MATRIZ),
  z.array(z.enum(ACOES_DA_MATRIZ)).max(ACOES_DA_MATRIZ.length),
);

export const conviteSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    nome: z.string().trim().min(2).max(120).optional(),
    papel: z.enum(["ADMIN", "COLABORADOR"]),
    permissoes: matrizSchema.optional(),
  })
  .refine((d) => d.papel === "COLABORADOR" || d.permissoes === undefined, {
    path: ["permissoes"],
    message: "admin_sem_matriz",
  });

export type Convite = z.infer<typeof conviteSchema>;
