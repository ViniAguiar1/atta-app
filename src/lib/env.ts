import { z } from "zod";

// Variáveis públicas (vão para o navegador). Validadas na borda: faltando, o app falha na subida, não no meio do uso.
const publicas = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export type EnvPublico = z.infer<typeof publicas>;

// O Next só embute no bundle o que é lido por nome literal; por isso a leitura campo a campo.
export function envPublico(): EnvPublico {
  return publicas.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
