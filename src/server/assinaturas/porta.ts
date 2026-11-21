import "server-only";
import type { Resultado } from "@/lib/errors";
import { portaAssinaturasSimulada } from "./simulado";
import type { ConfiguracaoDeAssinatura, ModeloDeAssinatura } from "./tipos";
import { portaAssinaturasVazia } from "./vazia";

// Contrato entre Configurações › Assinaturas & Validade (PDD v206 §10.4.2, Frontend 5) e o Backend 6 (ADR 0001,
// §"Modelo de Assinatura da Clínica", Tech Lead, 21/11). Uma chamada só: api.signature_settings_get() devolve o modelo
// e a chancela do preview (trade_name, legal_name, cnpj e o RT) e o rt_complete; api.signature_settings_set(p_model)
// grava qualquer um dos 3, mesmo sem RT (a trava fica na consolidação do documento, PDD §10.4.1). Só ADMIN
// (settings.view / settings.edit, no banco). Mudar o modelo vale só para os próximos documentos.
export type PortaAssinaturas = {
  /** null = sem leitura real ainda (porta vazia): a tela mostra o estado vazio do design */
  ler(): Promise<Resultado<ConfiguracaoDeAssinatura | null>>;
  salvarModelo(modelo: ModeloDeAssinatura): Promise<Resultado<ConfiguracaoDeAssinatura>>;
};

/** Escolha só aqui (modelo do #142): sem backend, vazia na produção e simulada na prévia, no local e no CI. */
export function escolherPortaAssinaturas(ambiente = process.env.VERCEL_ENV): PortaAssinaturas {
  return ambiente === "production" ? portaAssinaturasVazia : portaAssinaturasSimulada;
}

export const portaAssinaturas: PortaAssinaturas = escolherPortaAssinaturas();
