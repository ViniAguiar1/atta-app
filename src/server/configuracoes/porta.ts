import "server-only";
import type { Resultado } from "@/lib/errors";
import { portaConfiguracoesReal } from "./real";

// Contrato entre Configurações (MIG-42, Frontend) e a cascata do MIG-10/10b (Backend 2; ✅ do Backend 2 e do Tech Lead no
// #41). Leitura: atta_in.settings_screen (valor efetivo, origem, padrão e limites de cada chave); chave que a tela não
// conhece é ignorada. Escrita: atta_in.set_setting no nível da unidade, com a sessão do usuário (nunca a secret key), e
// a chave relida no settings_screen para devolver o Parametro completo. Erros pelo falhaDoBanco (ADR 0001 §5, #37):
// ATTA-AUTH-0004 → SEM_PERMISSAO; ATTA-IN-0001 → VALIDACAO; ATTA-IN-0003 → CONFLITO com a regra no reason
// ("ATTA-IN-0003:lembrete_2_min"); ATTA-CORE-0005 → NAO_ENCONTRADO. A real está em real.ts (MIG-10b, #57); a simulada fica só para os testes de unidade.
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

/** Celular da clínica que recebe o link do Fluxo alternativo (PDD §15.3; atta_in.alt_flow_phone, até 10 por clínica). O
 * número volta mascarado (o Backend 2 guarda cifrado, ADR 0002); editar é remover e adicionar. */
export type CelularDoFluxo = { id: string; nome: string; numeroMascarado: string };

export type PortaConfiguracoes = {
  /** Os parâmetros da clínica do token, no nível da unidade. SEM_PERMISSAO: quem não é ADMIN. */
  parametros(): Promise<Resultado<Parametro[]>>;
  /** Grava no nível da unidade e devolve o parâmetro como ficou. */
  salvarParametro(chave: ChaveDeParametro, valor: number | boolean): Promise<Resultado<Parametro>>;
  /** Celulares do Fluxo alternativo da clínica do token, na ordem em que foram cadastrados. */
  celulares(): Promise<Resultado<CelularDoFluxo[]>>;
  /** VALIDACAO com fields (nome de 1 a 40 caracteres; número com DDD + 9 dígitos, §16.6); LIMITE: já tem 10. */
  adicionarCelular(nome: string, numero: string): Promise<Resultado<CelularDoFluxo>>;
  /** NAO_ENCONTRADO: não existe ou é de outra clínica (a mesma resposta). */
  removerCelular(id: string): Promise<Resultado<{ id: string }>>;
};

export const portaConfiguracoes: PortaConfiguracoes = portaConfiguracoesReal;
