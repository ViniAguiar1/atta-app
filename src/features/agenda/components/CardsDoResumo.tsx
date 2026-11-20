import type { ReactNode } from "react";
import type { ResumoDaAgenda, Status } from "../schema";
import { textos } from "../textos";

// Cards do topo da Agenda (PDD v206 §10.2.2; simulador, captura 01): Agendamentos hoje, Agendamentos no mês, Check-in e
// Sem documento vinculado. Os números vêm prontos do banco (agenda_summary), no fuso da clínica: a tela não conta nada.
// Check-in: cada segmento filtra a lista por aquele estado e, clicado de novo, tira o filtro. Sem documento liga e
// desliga o filtro. "Agendamentos hoje" abre a visão Concluídos quando ela existir (PR seguinte): até lá não é botão.
// Pressionado tem desenho próprio (anel interno e peso), diferente do anel de foco. Breakpoints do tema (M3): medium e
// large; o tema zera os do Tailwind.

export type FiltroDosCards = { tipo: "status"; status: Status } | { tipo: "sem-documento" } | null;

const SEGMENTOS = [
  { status: "em_preenchimento", campo: "emPreenchimento", cor: "bg-status-info/15 text-text-primary", anel: "ring-text-primary" },
  { status: "pronto", campo: "pronto", cor: "bg-status-ready text-text-primary", anel: "ring-text-primary" },
  { status: "em_atendimento", campo: "emAtendimento", cor: "bg-brand text-on-brand", anel: "ring-on-brand" },
] as const;

/** Altura dos cards (7 rem); o esqueleto do DataState usa a mesma. */
export const ALTURA_DOS_CARDS_REM = 7;

type Props = {
  resumo: ResumoDaAgenda;
  filtro: FiltroDosCards;
  aoFiltrar: (filtro: FiltroDosCards) => void;
};

export function CardsDoResumo({ resumo, filtro, aoFiltrar }: Props) {
  const c = textos.cards;
  const semDocumentoAtivo = filtro?.tipo === "sem-documento";
  return (
    <section aria-label={c.rotulo} className="grid grid-cols-1 gap-4 medium:grid-cols-2 large:grid-cols-[1fr_1fr_2fr_1fr]">
      <Card icone={<IconeCalendario />}>
        <Titulo numero={resumo.hojeFaltam} texto={c.hoje.titulo} />
        <p className="text-sm text-text-secondary">{c.hoje.concluidos(resumo.hojeConcluidos)}</p>
      </Card>

      <Card icone={<IconeCalendario />}>
        <Titulo numero={resumo.mesConcluidos} texto={c.mes.titulo} />
        <p className="text-sm text-text-secondary">{c.mes.concluidos}</p>
        <p className="text-sm text-text-secondary">
          <span className="font-semibold text-text-primary">{resumo.mesHorariosLivres}</span> {c.mes.livres}
        </p>
      </Card>

      <Card icone={<IconeQr />}>
        <h2 className="text-xs font-medium tracking-wide text-text-secondary uppercase">{c.checkin.titulo}</h2>
        {/* os segmentos quebram em linhas quando o card é estreito: o rótulo inteiro sempre cabe (print de 390 px) */}
        <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-2">
          {SEGMENTOS.map(({ status, campo, cor, anel }) => {
            const n = resumo.checkin[campo];
            const ativo = filtro?.tipo === "status" && filtro.status === status;
            return (
              <button
                key={status}
                type="button"
                aria-pressed={ativo}
                aria-label={c.checkin.filtrar(textos.status[status], n)}
                onClick={() => aoFiltrar(ativo ? null : { tipo: "status", status })}
                className={`flex min-h-14 flex-col items-start justify-center rounded-md px-3 py-2 text-left ${cor} ${
                  ativo ? `font-semibold ring-2 ring-inset ${anel}` : ""
                }`}
              >
                <span className="font-sub text-xl" aria-hidden="true">
                  {n}
                </span>
                <span className="text-xs" aria-hidden="true">
                  {textos.status[status]}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card icone={<IconeDocumento />}>
        <button
          type="button"
          aria-pressed={semDocumentoAtivo}
          aria-label={c.semDocumento.filtrar(resumo.semDocumento)}
          onClick={() => aoFiltrar(semDocumentoAtivo ? null : { tipo: "sem-documento" })}
          className={`-m-2 flex min-h-11 flex-col items-start rounded-md p-2 text-left ${
            semDocumentoAtivo ? "bg-status-negative/10 ring-2 ring-inset ring-status-negative" : ""
          }`}
        >
          <span aria-hidden="true" className="flex items-baseline gap-2">
            <span className="font-sub text-3xl text-status-negative">{resumo.semDocumento}</span>
            <span className="text-xs font-medium tracking-wide text-text-secondary uppercase">{c.semDocumento.titulo}</span>
          </span>
          <span aria-hidden="true" className="text-sm text-text-secondary">
            {c.semDocumento.texto}
          </span>
        </button>
      </Card>
    </section>
  );
}

function Card({ icone, children }: { icone: ReactNode; children: ReactNode }) {
  return (
    <div
      className="relative flex flex-col gap-1 rounded-md border border-border bg-surface-raised p-4"
      style={{ minHeight: `${ALTURA_DOS_CARDS_REM}rem` }}
    >
      <span
        aria-hidden="true"
        className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-md bg-surface-card text-text-secondary"
      >
        {icone}
      </span>
      {children}
    </div>
  );
}

function Titulo({ numero, texto }: { numero: number; texto: string }) {
  return (
    <h2 className="flex items-baseline gap-2 pr-10">
      <span className="font-sub text-3xl text-text-primary">{numero}</span>
      <span className="text-xs font-medium tracking-wide text-text-secondary uppercase">{texto}</span>
    </h2>
  );
}

// Ícones de traço fino (Guia de Design §7), decorativos.
function IconeCalendario() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" focusable="false">
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

function IconeQr() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" focusable="false">
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h2v2M20 14v6h-6v-2" />
    </svg>
  );
}

function IconeDocumento() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" focusable="false">
      <path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z" />
      <path d="M14 3.5V8h4M9.5 13h5M9.5 16.5h5" />
    </svg>
  );
}
