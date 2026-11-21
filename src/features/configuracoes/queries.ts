import "server-only";
import { ok, type Resultado } from "@/lib/errors";
import { type CelularDoFluxo, type Parametro, portaConfiguracoes } from "@/server/configuracoes/porta";
import { type PerfilDaClinica, portaPerfil } from "@/server/perfil/porta";

// Leitura no servidor (Server Component), com a sessão do usuário: nada de supabase-js autenticado no navegador.
export type DadosDeAgendamentos = { parametros: Parametro[]; celulares: CelularDoFluxo[] };

export async function carregarAgendamentos(): Promise<Resultado<DadosDeAgendamentos>> {
  const [parametros, celulares] = await Promise.all([portaConfiguracoes.parametros(), portaConfiguracoes.celulares()]);
  if (!parametros.ok) return parametros;
  if (!celulares.ok) return celulares;
  return ok({ parametros: parametros.data, celulares: celulares.data });
}

/** Perfil da Clínica (PDD §10.4.1). null: sem leitura real ainda (a tela mostra o estado vazio do design). */
export const carregarPerfil = (): Promise<Resultado<PerfilDaClinica | null>> => portaPerfil.perfil();
