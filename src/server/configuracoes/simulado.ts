import "server-only";
import { falha, ok, type Resultado } from "@/lib/errors";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { CelularDoFluxo, ChaveDeParametro, Parametro, PortaConfiguracoes } from "./porta";

// Simulada de Configurações até o MIG-10b (Backend 2): os padrões e limites do contrato, e as regras cruzadas do banco
// (o 2º lembrete vem antes do 1º; o 1º cabe na antecedência do envio). Guarda o que foi salvo só na memória desta
// instância, separado por clínica (a do token), para uma clínica não ver o que outra salvou. Sem dado de ninguém.
const PADROES: Parametro[] = [
  { chave: "link_envio_antecedencia_h", tipo: "int", valor: 3, padrao: 3, origem: "sistema", min: 1, max: 24, permitidos: null },
  { chave: "link_validade_apos_h", tipo: "int", valor: 1, padrao: 1, origem: "sistema", min: 0, max: 4, permitidos: null },
  { chave: "lembrete_1_min", tipo: "int", valor: 60, padrao: 60, origem: "sistema", min: 15, max: 240, permitidos: null },
  { chave: "lembrete_2_min", tipo: "int", valor: 30, padrao: 30, origem: "sistema", min: 5, max: 120, permitidos: null },
  { chave: "janela_de_confirmacao_h", tipo: "int", valor: 72, padrao: 72, origem: "sistema", min: 1, max: 720, permitidos: null },
  { chave: "tolerancia_da_ausencia_min", tipo: "int", valor: 120, padrao: 120, origem: "sistema", min: null, max: null, permitidos: [0, 15, 30, 60, 90, 120] },
  { chave: "fluxo_alternativo_habilitado", tipo: "bool", valor: true, padrao: true, origem: "sistema" },
];

type DaClinica = { salvos: Map<ChaveDeParametro, number | boolean>; celulares: CelularDoFluxo[] };
const porClinica = new Map<string, DaClinica>();

async function daClinica(): Promise<DaClinica> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getClaims();
  const tenant = typeof data?.claims?.tenant_id === "string" ? data.claims.tenant_id : "sem-clinica";
  if (!porClinica.has(tenant)) porClinica.set(tenant, { salvos: new Map(), celulares: [] });
  return porClinica.get(tenant) as DaClinica;
}

const atual = (salvos: DaClinica["salvos"]): Parametro[] =>
  PADROES.map((p) => (salvos.has(p.chave) ? ({ ...p, valor: salvos.get(p.chave), origem: "unidade" } as Parametro) : p));

// a máscara é do servidor; a simulada imita o formato (DDD e os 4 últimos)
const mascarar = (d: string) => `(${d.slice(0, 2)}) ·····-${d.slice(7)}`;

const inteiro = (lista: Parametro[], chave: ChaveDeParametro) => Number(lista.find((p) => p.chave === chave)?.valor);

// Conflito como o falhaDoBanco devolve: a regra no reason (ADR 0001 §5).
const conflito = (regra: ChaveDeParametro): Resultado<never> => falha("CONFLITO", "Regra cruzada.", undefined, `ATTA-IN-0003:${regra}`);

export const portaConfiguracoesSimulada: PortaConfiguracoes = {
  async parametros() {
    return ok(atual((await daClinica()).salvos));
  },
  async salvarParametro(chave, valor) {
    const { salvos } = await daClinica();
    const p = atual(salvos).find((x) => x.chave === chave);
    if (!p) return falha("NAO_ENCONTRADO", "Parâmetro inexistente.");
    if (p.tipo === "bool" ? typeof valor !== "boolean" : !Number.isInteger(valor)) return falha("VALIDACAO", "Tipo errado.");
    if (p.tipo === "int") {
      const n = valor as number;
      const fora = (p.min !== null && n < p.min) || (p.max !== null && n > p.max) || (p.permitidos !== null && !p.permitidos.includes(n));
      if (fora) return falha("VALIDACAO", "Fora do limite.", [{ campo: chave, code: "VALIDACAO" }]);
      const depois = atual(salvos).map((x) => (x.chave === chave ? ({ ...x, valor: n } as Parametro) : x));
      if (inteiro(depois, "lembrete_2_min") >= inteiro(depois, "lembrete_1_min"))
        return conflito("lembrete_2_min");
      if (inteiro(depois, "lembrete_1_min") > inteiro(depois, "link_envio_antecedencia_h") * 60)
        return conflito("lembrete_1_min");
    }
    salvos.set(chave, valor);
    return ok(atual(salvos).find((x) => x.chave === chave) as Parametro);
  },
  async celulares() {
    return ok([...(await daClinica()).celulares]);
  },
  async adicionarCelular(nome, numero) {
    const clinica = await daClinica();
    const digitos = numero.replace(/\D/g, "");
    const campos = [
      ...(nome.trim().length < 1 || nome.trim().length > 40 ? [{ campo: "nome", code: "VALIDACAO" as const }] : []),
      ...(!/^[1-9]{2}9\d{8}$/.test(digitos) ? [{ campo: "numero", code: "VALIDACAO" as const }] : []),
    ];
    if (campos.length) return falha("VALIDACAO", "Confira os campos.", campos);
    if (clinica.celulares.length >= 10) return falha("LIMITE", "Até 10 celulares.");
    const celular = { id: crypto.randomUUID(), nome: nome.trim(), numeroMascarado: mascarar(digitos) };
    clinica.celulares.push(celular);
    return ok(celular);
  },
  async removerCelular(id) {
    const clinica = await daClinica();
    const antes = clinica.celulares.length;
    clinica.celulares = clinica.celulares.filter((c) => c.id !== id);
    return clinica.celulares.length < antes ? ok({ id }) : falha("NAO_ENCONTRADO", "Celular inexistente.");
  },
};
