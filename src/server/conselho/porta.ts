import "server-only";
import type { Conselho } from "@/features/propass/schema";

// Camada 1 do PROpass, "Validação ATTA (Conselho)" (PDD v206 §10.4.3): conferência AUTOMÁTICA do registro na base do
// conselho, sem comprovante do profissional. A consulta é serviço externo e espera a PO (R20); a regra de só Supabase e
// Vercel vale até lá. Decisão do dono (PLANO, "Conferência do conselho no PROpass"; ADR 0006 §3): sem a consulta, o
// PROpass conclui "aguardando conferência", o time ATTA confere à mão e aprova no backoffice, e o profissional só é
// agendável depois disso. Por isso a única implementação hoje responde 'nao_consultado', na produção e no stage (que é
// igual à produção). Quando a consulta existir, entra outra implementação desta porta, sem mexer em quem a usa.
//
// Uso no envio do PROpass (server action), sempre na mesma requisição do submit, nunca reaproveitando o passo anterior
// (Segurança, revisão do #129):
//   const situacao = await portaConselho.conferir(registro);
//   const estado = estadoDoConselhoParaOBanco(situacao);
//   if (!estado) return falha("CONFLITO", …);   // não confere: não chama o submit
//   … api.propass_submit({ …, p_council_status: estado })

export type RegistroNoConselho = { conselho: Conselho; numero: string; uf: string; nome: string };

export type SituacaoDoConselho =
  | { situacao: "regularizado"; consultadoEm: string } // ISO 8601, só com consulta de verdade
  | { situacao: "nao_confere" }
  | { situacao: "nao_consultado" };

export type PortaConselho = { conferir(registro: RegistroNoConselho): Promise<SituacaoDoConselho> };

/** Sem consulta automática (R20): nunca afirma a regularidade nem recusa. */
export const conselhoSemConsulta: PortaConselho = {
  async conferir() {
    return { situacao: "nao_consultado" };
  },
};

export const portaConselho: PortaConselho = conselhoSemConsulta;

/**
 * O que vai no p_council_status do api.propass_submit. 'nao_confere' não grava (null: o servidor recusa sem chamar o
 * banco). O valor do "não consultado" no banco é 'nao_consultado' até a migration do backoffice da conferência, que o
 * renomeia para 'aguardando_conferencia' (ADR 0006 §3); quando ela entrar, muda só aqui.
 */
export function estadoDoConselhoParaOBanco(s: SituacaoDoConselho): "regularizado" | "nao_consultado" | null {
  switch (s.situacao) {
    case "regularizado":
      return "regularizado";
    case "nao_consultado":
      return "nao_consultado";
    case "nao_confere":
      return null;
  }
}
