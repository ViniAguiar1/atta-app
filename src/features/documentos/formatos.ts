import type { ModeloDeDocumento } from "@/server/documentos/porta";
import { textos } from "./textos";

// Formatos da lista de modelos. A data vem do servidor em ISO; a do dia (DD/MM/AAAA) é no fuso de São Paulo até a
// lista trazer o fuso da clínica (como na Agenda), para a data não virar no navegador de outro fuso.
const FUSO_PADRAO = "America/Sao_Paulo";

export const data = (iso: string, fuso = FUSO_PADRAO) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: fuso }).format(new Date(iso));

export const numero = (n: number | null) => (n === null ? textos.semValor : new Intl.NumberFormat("pt-BR").format(n));

export function frequencia(m: Pick<ModeloDeDocumento, "frequencia" | "validadeMeses">): string {
  if (m.frequencia === "por_procedimento") return textos.porProcedimento;
  if (m.frequencia === "unica") return textos.unica(m.validadeMeses ? textos.meses(m.validadeMeses) : textos.indeterminada);
  return textos.semValor; // rascunho sem frequência escolhida
}
