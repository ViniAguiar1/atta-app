"use client";

import type { ReactNode } from "react";

// Card de resumo do topo das telas (Simulador ATTA-in: cards de Pacientes, captura 09; os simples da Agenda, captura 01;
// os do ATTA). Dono: Frontend 3 (componente comum, ORDEM do Tech Lead Frontend). Número grande, o RÓTULO ao lado em
// versalete por CSS (o HTML guarda o texto normal, que o leitor de tela lê), o ícone num quadradinho no canto direito e
// a legenda embaixo. Sem número, "—": nunca dado de mentira. Sempre client: com `filtro`, vira botão (aria-pressed).

export type TomDoIcone = "neutro" | "marca" | "negativo";

type Props = {
  /** null → "—". */
  valor: string | number | null;
  /** Texto normal ("Pacientes"); o componente põe em versalete. */
  rotulo: string;
  /** Decorativo: o componente põe aria-hidden. */
  icone: ReactNode;
  /** A linha (ou linhas) de baixo; aceita fragmento com quebra. */
  legenda?: ReactNode;
  /** Quadradinho do ícone: neutro (cinza claro, padrão), marca (verde claro) ou negativo (rosado). */
  tom?: TomDoIcone;
  /** Número e quadradinho na cor de alerta (o "Sem documento vinculado" da Agenda). */
  destaque?: "negativo";
  /** Com filtro, o card inteiro é um botão que liga e desliga o filtro. */
  filtro?: { pressionado: boolean; aoAlternar: () => void; rotuloFalado: string };
};

const TONS: Record<TomDoIcone, string> = {
  neutro: "bg-surface-card text-text-secondary",
  marca: "bg-brand/10 text-brand",
  negativo: "bg-status-negative/10 text-status-negative",
};

export const TRAVESSAO = "—";

export function CardDeResumo({ valor, rotulo, icone, legenda, tom = "neutro", destaque, filtro }: Props) {
  const negativo = destaque === "negativo";
  const conteudo = (
    <>
      <span
        aria-hidden="true"
        className={`absolute top-4 right-4 flex size-8 items-center justify-center rounded-md ${TONS[negativo ? "negativo" : tom]}`}
      >
        {icone}
      </span>
      <span className="flex items-baseline gap-2 pr-10" aria-hidden={filtro ? true : undefined}>
        <span className={`font-sub text-3xl leading-none ${negativo ? "text-status-negative" : "text-text-primary"}`}>
          {valor ?? TRAVESSAO}
        </span>
        <span className="text-xs font-medium tracking-wide text-text-secondary uppercase">{rotulo}</span>
      </span>
      {legenda && (
        <span className="flex flex-col text-sm text-text-secondary" aria-hidden={filtro ? true : undefined}>
          {legenda}
        </span>
      )}
    </>
  );
  const caixa = "relative flex min-h-28 flex-col gap-2 rounded-md border border-border bg-surface-raised p-4 text-left";

  if (filtro) {
    return (
      <button
        type="button"
        aria-pressed={filtro.pressionado}
        aria-label={filtro.rotuloFalado}
        onClick={filtro.aoAlternar}
        className={`${caixa} w-full ${filtro.pressionado ? (negativo ? "bg-status-negative/10 ring-2 ring-inset ring-status-negative" : "ring-2 ring-inset ring-text-primary") : ""}`}
      >
        {conteudo}
      </button>
    );
  }
  return <div className={caixa}>{conteudo}</div>;
}
