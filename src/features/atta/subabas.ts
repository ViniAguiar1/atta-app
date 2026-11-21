import type { Subaba } from "@/components/ui/Subabas";
import { textos as t } from "./textos";

// Subabas do Módulo ATTA, na ordem do simulador (capturas 19 a 23). Subaba sem tela não aparece (Tech Lead Frontend,
// 20/11): cada PR do MIG-48 acrescenta a sua. A primeira da lista é a que /painel/atta abre.
export const ROTA_ATTA = "/painel/atta";

const TODAS = {
  ajuda: { rotulo: t.subabas.ajuda, href: `${ROTA_ATTA}/ajuda` },
  suporte: { rotulo: t.subabas.suporte, href: `${ROTA_ATTA}/suporte` },
  privacidade: { rotulo: t.subabas.privacidade, href: `${ROTA_ATTA}/privacidade` },
  cocriacao: { rotulo: t.subabas.cocriacao, href: `${ROTA_ATTA}/cocriacao` },
  solucoes: { rotulo: t.subabas.solucoes, href: `${ROTA_ATTA}/solucoes` },
} satisfies Record<string, Subaba>;

export const SUBABAS_ATTA: readonly Subaba[] = [TODAS.privacidade, TODAS.solucoes];
export const HREF = { privacidade: TODAS.privacidade.href, solucoes: TODAS.solucoes.href };
