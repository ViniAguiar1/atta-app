import type { TermoQueBloqueia } from "@/server/servicos/porta";

// Fora do arquivo "use server": lá só podem sair funções assíncronas (revisão do Backend 4 no #75).
/** Regra do banco quando o Serviço é o único procedimento de algum termo Ativo (Backend 6, #76). */
export const REASON_SERVICO_COM_TERMOS = "ATTA-IN-0004:clinic_service_id";

/** Texto provisório até a PO responder (textos-para-a-po.md, R15). */
export function mensagemDeTermos(termos: readonly Pick<TermoQueBloqueia, "titulo">[]): string {
  return `Antes de excluir este Serviço, vincule outro procedimento a: ${termos.map((t) => t.titulo).join(", ")}.`;
}
