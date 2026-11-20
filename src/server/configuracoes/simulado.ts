import "server-only";
import { type Erro, falha, ok, type Resultado } from "@/lib/errors";
import type { ChaveDeParametro, Parametro, PortaConfiguracoes } from "./porta";

// Simulada de Configurações até o MIG-10b (Backend 2): os padrões e limites do contrato, e as regras cruzadas do banco
// (o 2º lembrete vem antes do 1º; o 1º cabe na antecedência do envio). Guarda o que foi salvo só na memória desta
// instância: é para a tela andar, sem dado de ninguém.
const PADROES: Parametro[] = [
  { chave: "link_envio_antecedencia_h", tipo: "int", valor: 3, padrao: 3, origem: "sistema", min: 1, max: 24, permitidos: null },
  { chave: "link_validade_apos_h", tipo: "int", valor: 1, padrao: 1, origem: "sistema", min: 0, max: 4, permitidos: null },
  { chave: "lembrete_1_min", tipo: "int", valor: 60, padrao: 60, origem: "sistema", min: 15, max: 240, permitidos: null },
  { chave: "lembrete_2_min", tipo: "int", valor: 30, padrao: 30, origem: "sistema", min: 5, max: 120, permitidos: null },
  { chave: "janela_de_confirmacao_h", tipo: "int", valor: 72, padrao: 72, origem: "sistema", min: 1, max: 720, permitidos: null },
  { chave: "tolerancia_da_ausencia_min", tipo: "int", valor: 120, padrao: 120, origem: "sistema", min: null, max: null, permitidos: [0, 15, 30, 60, 90, 120] },
  { chave: "fluxo_alternativo_habilitado", tipo: "bool", valor: true, padrao: true, origem: "sistema" },
];

const salvos = new Map<ChaveDeParametro, number | boolean>();

const atual = (): Parametro[] =>
  PADROES.map((p) => (salvos.has(p.chave) ? ({ ...p, valor: salvos.get(p.chave), origem: "unidade" } as Parametro) : p));

const inteiro = (lista: Parametro[], chave: ChaveDeParametro) => Number(lista.find((p) => p.chave === chave)?.valor);

// Conflito como o falhaDoBanco do #37 devolve: a regra no reason (ADR 0001 §5). O Erro da main ainda não tem o campo.
const conflito = (regra: ChaveDeParametro): Resultado<never> => {
  const error: Erro & { reason: string } = { code: "CONFLITO", message: "Regra cruzada.", reason: `ATTA-IN-0003:${regra}` };
  return { ok: false, error };
};

export const portaConfiguracoesSimulada: PortaConfiguracoes = {
  async parametros() {
    return ok(atual());
  },
  async salvarParametro(chave, valor) {
    const p = atual().find((x) => x.chave === chave);
    if (!p) return falha("NAO_ENCONTRADO", "Parâmetro inexistente.");
    if (p.tipo === "bool" ? typeof valor !== "boolean" : !Number.isInteger(valor)) return falha("VALIDACAO", "Tipo errado.");
    if (p.tipo === "int") {
      const n = valor as number;
      const fora = (p.min !== null && n < p.min) || (p.max !== null && n > p.max) || (p.permitidos !== null && !p.permitidos.includes(n));
      if (fora) return falha("VALIDACAO", "Fora do limite.", [{ campo: chave, code: "VALIDACAO" }]);
      const depois = atual().map((x) => (x.chave === chave ? ({ ...x, valor: n } as Parametro) : x));
      if (inteiro(depois, "lembrete_2_min") >= inteiro(depois, "lembrete_1_min"))
        return conflito("lembrete_2_min");
      if (inteiro(depois, "lembrete_1_min") > inteiro(depois, "link_envio_antecedencia_h") * 60)
        return conflito("lembrete_1_min");
    }
    salvos.set(chave, valor);
    return ok(atual().find((x) => x.chave === chave) as Parametro);
  },
};
