import type { Subaba } from "@/components/ui/Subabas";
import { textos as t } from "./textos";

// Subabas do Módulo ATTA, as 5 do simulador e na ordem dele (capturas 19 a 23). Todas aparecem (régua do Tech Lead
// Frontend, 20/11): a que ainda não tem tela abre no estado vazio do design. A primeira é a que /painel/atta abre.
export const ROTA_ATTA = "/painel/atta";

const TODAS = {
  ajuda: { rotulo: t.subabas.ajuda, href: `${ROTA_ATTA}/ajuda` },
  suporte: { rotulo: t.subabas.suporte, href: `${ROTA_ATTA}/suporte` },
  privacidade: { rotulo: t.subabas.privacidade, href: `${ROTA_ATTA}/privacidade` },
  cocriacao: { rotulo: t.subabas.cocriacao, href: `${ROTA_ATTA}/cocriacao` },
  solucoes: { rotulo: t.subabas.solucoes, href: `${ROTA_ATTA}/solucoes` },
} satisfies Record<string, Subaba>;

export const SUBABAS_ATTA: readonly Subaba[] = [TODAS.ajuda, TODAS.suporte, TODAS.privacidade, TODAS.cocriacao, TODAS.solucoes];
export const HREF = {
  ajuda: TODAS.ajuda.href,
  suporte: TODAS.suporte.href,
  privacidade: TODAS.privacidade.href,
  cocriacao: TODAS.cocriacao.href,
  solucoes: TODAS.solucoes.href,
};
