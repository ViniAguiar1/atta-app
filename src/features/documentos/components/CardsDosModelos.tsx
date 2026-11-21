import type { ReactNode } from "react";
import type { ResumoDosModelos } from "@/server/documentos/porta";
import { numero } from "../formatos";
import { textos } from "../textos";

// Cartões do topo de Termos & Docs (simulador, captura 39). Os números vêm prontos do servidor; o que não tem fonte
// chega null e aparece "—" (regra do Tech Lead Frontend). Docs vencendo usa a cor de alerta, como no simulador.
export function CardsDosModelos({ resumo }: { resumo: ResumoDosModelos }) {
  const c = textos.cards;
  const pct = resumo.percentualAttaSign === null ? textos.semValor : `${resumo.percentualAttaSign}%`;
  return (
    <section aria-label={c.rotulo} className="grid grid-cols-1 gap-4 medium:grid-cols-3 large:max-w-[67rem]">
      <Card icone={<IconeDocumento />} numero={numero(resumo.ativos)} titulo={c.ativos}>
        {c.obrigatoriosOpcionais(numero(resumo.obrigatorios), numero(resumo.opcionais))}
      </Card>
      <Card icone={<IconeAlerta />} numero={numero(resumo.vencendo)} titulo={c.vencendo} alerta>
        {c.vencidos(numero(resumo.vencidos))}
      </Card>
      <Card icone={<IconeCaneta />} numero={numero(resumo.assinados)} titulo={c.assinados}>
        {c.comAttaSign(pct)}
      </Card>
    </section>
  );
}

type PropsDoCard = { icone: ReactNode; numero: string; titulo: string; alerta?: boolean; children: ReactNode };

function Card({ icone, numero: n, titulo, alerta = false, children }: PropsDoCard) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-raised px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-baseline gap-2">
          <span className={`font-sub text-3xl font-medium leading-none ${alerta ? "text-status-negative" : "text-text-primary"}`}>{n}</span>
          <span className="text-xs font-medium tracking-wide text-text-primary uppercase">{titulo}</span>
        </h2>
        <span aria-hidden="true" className={`grid size-7 place-items-center rounded-md ${alerta ? "bg-status-negative/15 text-status-negative" : "bg-surface-card text-text-primary"}`}>
          {icone}
        </span>
      </div>
      <p className="text-sm text-text-secondary">{children}</p>
    </div>
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
