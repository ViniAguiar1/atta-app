import { textos } from "./textos";

// Subabas de Métricas (Simulador ATTA-in, captura 40): Painel · Funil e tendências · Exportação.
export const SUBABAS_DE_METRICAS = [
  { rotulo: textos.subabas.painel, href: "/painel/metricas" },
  { rotulo: textos.subabas.funil, href: "/painel/metricas/funil" },
  { rotulo: textos.subabas.exportacao, href: "/painel/metricas/exportacao" },
] as const;
