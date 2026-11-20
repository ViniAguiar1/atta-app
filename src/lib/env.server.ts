import "server-only";
import { z } from "zod";

// Variáveis só de servidor (ADR 0001 §4). A secret key passa por cima da RLS: só em src/server/**, **/actions.ts e
// app/**/route.ts (regra do ESLint), e quem chama confere o papel e o tenant antes.
const servidor = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
  // Chave mestra do Formulário de Saúde (ADR 0002): variável sensível da Vercel, lida só no servidor, runtime Node.
  // Opcional até o MIG-22; quem a usar valida a presença e a versão.
  ATTA_SAUDE_CHAVE_MESTRA: z.string().min(1).optional(),
  // As outras chaves e peppers da ADR 0002, mesma regra (variável sensível da Vercel, só servidor); opcionais até o
  // item que usa cada uma validar a presença.
  ATTA_DOCUMENTOS_CHAVE_MESTRA: z.string().min(1).optional(),
  ATTA_REDE_CHAVE_MESTRA: z.string().min(1).optional(),
  ATTA_CPF_PEPPER: z.string().min(1).optional(),
  ATTA_RNE_PEPPER: z.string().min(1).optional(),
  ATTA_SEAL_PRIVATE_KEY: z.string().min(1).optional(),
  ATTA_SEAL_KID: z.string().min(1).optional(),
});

export type EnvServidor = z.infer<typeof servidor>;

export function envServidor(): EnvServidor {
  const opcional = (nome: string) => process.env[nome] || undefined; // variável vazia conta como ausente
  return servidor.parse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    ATTA_SAUDE_CHAVE_MESTRA: opcional("ATTA_SAUDE_CHAVE_MESTRA"),
    ATTA_DOCUMENTOS_CHAVE_MESTRA: opcional("ATTA_DOCUMENTOS_CHAVE_MESTRA"),
    ATTA_REDE_CHAVE_MESTRA: opcional("ATTA_REDE_CHAVE_MESTRA"),
    ATTA_CPF_PEPPER: opcional("ATTA_CPF_PEPPER"),
    ATTA_RNE_PEPPER: opcional("ATTA_RNE_PEPPER"),
    ATTA_SEAL_PRIVATE_KEY: opcional("ATTA_SEAL_PRIVATE_KEY"),
    ATTA_SEAL_KID: opcional("ATTA_SEAL_KID"),
  });
}
