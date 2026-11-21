import { CardDeResumo } from "@/components/ui/CardDeResumo";
import type { ResumoDosModelos } from "@/server/documentos/porta";
import { numero } from "../formatos";
import { textos } from "../textos";

// Cartões do topo de Termos & Docs (simulador, captura 39), com o CardDeResumo comum. Os números vêm prontos do
// servidor; o que não tem fonte chega null e aparece "—" (regra do Tech Lead Frontend). Docs vencendo em alerta.
export function CardsDosModelos({ resumo }: { resumo: ResumoDosModelos }) {
  const c = textos.cards;
  const pct = resumo.percentualAttaSign === null ? textos.semValor : `${resumo.percentualAttaSign}%`;
  return (
    <section aria-label={c.rotulo} className="grid grid-cols-1 gap-4 medium:grid-cols-3 large:max-w-[67rem]">
      <CardDeResumo valor={resumo.ativos} rotulo={c.ativos} icone={<IconeDocumento />} legenda={c.obrigatoriosOpcionais(numero(resumo.obrigatorios), numero(resumo.opcionais))} />
      <CardDeResumo valor={resumo.vencendo} rotulo={c.vencendo} icone={<IconeAlerta />} destaque="negativo" legenda={c.vencidos(numero(resumo.vencidos))} />
      <CardDeResumo valor={resumo.assinados === null ? null : numero(resumo.assinados)} rotulo={c.assinados} icone={<IconeCaneta />} legenda={c.comAttaSign(pct)} />
    </section>
  );
}

const svg = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const IconeDocumento = () => (
  <svg {...svg}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </svg>
);
const IconeAlerta = () => (
  <svg {...svg}>
    <path d="M12 4 2.5 20h19z" />
    <path d="M12 10v4M12 17h.01" />
  </svg>
);
const IconeCaneta = () => (
  <svg {...svg}>
    <path d="m4 20 4-1 11-11-3-3L5 16z" />
  </svg>
);
