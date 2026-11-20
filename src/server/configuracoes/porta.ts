import "server-only";
import type { Resultado } from "@/lib/errors";
import { portaConfiguracoesSimulada } from "./simulado";

// Contrato entre Configurações (MIG-42, Frontend) e a cascata do MIG-10/10b (Backend 2; aprovação do Tech Lead).
// Leitura: atta_in.settings_screen (valor efetivo, origem, padrão e limites de cada chave). Escrita: atta_in.set_setting
// no nível da unidade, com a sessão do usuário (nunca a secret key). Erros do banco viram Resultado:
// ATTA-AUTH-0004 → SEM_PERMISSAO; ATTA-IN-0001 → VALIDACAO (fora do limite); ATTA-IN-0003 → CONFLITO, com a regra em
// fields[0].campo (ex.: lembrete_2_min); ATTA-CORE-0005 → NAO_ENCONTRADO. Até o MIG-10b entrar, a implementação é a simulada.
export type ChaveDeParametro =
  | "link_envio_antecedencia_h"
  | "link_validade_apos_h"
  | "lembrete_1_min"
  | "lembrete_2_min"
  | "janela_de_confirmacao_h"
  | "tolerancia_da_ausencia_min"
  | "fluxo_alternativo_habilitado";

export type OrigemDoValor = "sistema" | "unidade" | "tipo_de_atendimento" | "servico";

export type Parametro =
  | { chave: ChaveDeParametro; tipo: "int"; valor: number; padrao: number; origem: OrigemDoValor; min: number | null; max: number | null; permitidos: number[] | null }
  | { chave: ChaveDeParametro; tipo: "bool"; valor: boolean; padrao: boolean; origem: OrigemDoValor };

export type PortaConfiguracoes = {
  /** Os parâmetros da clínica do token, no nível da unidade. SEM_PERMISSAO: quem não é ADMIN. */
  parametros(): Promise<Resultado<Parametro[]>>;
  /** Grava no nível da unidade e devolve o parâmetro como ficou. */
  salvarParametro(chave: ChaveDeParametro, valor: number | boolean): Promise<Resultado<Parametro>>;
};

export const portaConfiguracoes: PortaConfiguracoes = portaConfiguracoesSimulada;
