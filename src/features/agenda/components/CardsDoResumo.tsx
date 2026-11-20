import { CardDeResumo } from "@/components/ui/CardDeResumo";
import type { ResumoDaAgenda, Status } from "../schema";
import { SEM_NUMERO, textos } from "../textos";

// Cards do topo da Agenda (PDD v206 §10.2.2; simulador, captura 01): Agendamentos hoje, Agendamentos no mês, Check-in e
// Sem documento vinculado. Os números vêm prontos do banco (agenda_summary), no fuso da clínica: a tela não conta nada.
// Check-in: cada segmento filtra a lista por aquele estado e, clicado de novo, tira o filtro. Sem documento liga e
// desliga o filtro (na visão Hoje). Na visão Todos o Check-in dá lugar ao card Confirmação (§10.2.2), só leitura.
// Pressionado tem desenho próprio (anel interno e peso), diferente do anel de foco. Breakpoints do tema (M3): medium e
// large; o tema zera os do Tailwind.

export type FiltroDosCards = { tipo: "status"; status: Status } | { tipo: "sem-documento" } | null;
export type VisaoDosCards = "hoje" | "todos" | "concluidos";

// Tons dos segmentos: oliva crescente, como no simulador (captura 01; decisão do CTO, 20/11: visual segue o simulador).
const TONS = [
  { cor: "bg-status-checkin/15 text-text-primary", anel: "ring-text-primary", ponto: "bg-text-secondary" },
  { cor: "bg-status-checkin/35 text-text-primary", anel: "ring-text-primary", ponto: "bg-text-secondary" },
  { cor: "bg-status-checkin text-on-brand", anel: "ring-on-brand", ponto: "bg-on-brand/70" },
] as const;

const CHECKIN = [
  { status: "em_preenchimento", campo: "emPreenchimento" },
  { status: "pronto", campo: "pronto" },
  { status: "em_atendimento", campo: "emAtendimento" },
] as const;

/** Altura dos cards (7 rem); o esqueleto do DataState usa a mesma. */
export const ALTURA_DOS_CARDS_REM = 7;

type Props = {
  resumo: ResumoDaAgenda;
  /** Todos troca o Check-in pelo card Confirmação (§10.2.2); Hoje e Concluídos mostram o Check-in */
  visao?: VisaoDosCards;
  filtro: FiltroDosCards;
  /** sem ela, os cards só mostram (os filtros dos cards valem na visão Hoje) */
  aoFiltrar?: (filtro: FiltroDosCards) => void;
};

type Segmento = { chave: string; rotulo: string; numero: number | null; ativo: boolean; aoAlternar?: () => void; falado?: string };

export function CardsDoResumo({ resumo, visao = "hoje", filtro, aoFiltrar }: Props) {
  const c = textos.cards;
  const semDocumentoAtivo = filtro?.tipo === "sem-documento";
  const segmentosDoCheckin: Segmento[] = CHECKIN.map(({ status, campo }) => {
    const ativo = filtro?.tipo === "status" && filtro.status === status;
    const numero = resumo.checkin[campo];
    return {
      chave: status,
      rotulo: textos.status[status],
      numero,
      ativo,
      aoAlternar: aoFiltrar && (() => aoFiltrar(ativo ? null : { tipo: "status", status })),
      falado: c.checkin.filtrar(textos.status[status], numero),
    };
  });
  const k = textos.confirmacao;
  const segmentosDaConfirmacao: Segmento[] = [
    { chave: "agendados", rotulo: k.agendados, numero: resumo.confirmacao.agendados, ativo: false },
    { chave: "a-confirmar", rotulo: k.aConfirmar, numero: resumo.confirmacao.aConfirmar, ativo: false },
    { chave: "confirmados", rotulo: k.confirmados, numero: resumo.confirmacao.confirmados, ativo: false },
  ];
  const todos = visao === "todos";
  return (
    <section aria-label={c.rotulo} className="grid grid-cols-1 gap-4 medium:grid-cols-2 large:grid-cols-[1fr_1fr_2fr_1fr]">
      <CardDeResumo
        valor={resumo.hojeFaltam}
        rotulo={c.hoje.titulo}
        icone={<IconeCalendario />}
        legenda={c.hoje.concluidos(resumo.hojeConcluidos)}
      />
      <CardDeResumo
        valor={resumo.mesConcluidos}
        rotulo={c.mes.titulo}
        icone={<IconeCalendario />}
        legenda={
          <>
            <span>{c.mes.concluidos}</span>
            <span>
              <span className="font-semibold text-text-primary">{resumo.mesHorariosLivres ?? SEM_NUMERO}</span> {c.mes.livres}
            </span>
          </>
        }
      />

      {/* O card do Check-in (e da Confirmação, na visão Todos) é próprio da Agenda, no mesmo desenho do CardDeResumo. */}
      <div className="relative flex flex-col gap-2 rounded-md border border-border bg-surface-raised p-3.5">
        <span
          aria-hidden="true"
          className="absolute top-3.5 right-3.5 flex size-8 items-center justify-center rounded-md bg-surface-card text-text-secondary"
        >
          <IconeQr />
        </span>
        <h2 className="text-[0.6875rem] font-medium tracking-wide text-text-secondary uppercase">
          {todos ? k.titulo : c.checkin.titulo}
        </h2>
        {/* os segmentos quebram em linhas quando o card é estreito: o rótulo inteiro sempre cabe (print de 390 px) */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-2">
          {(todos ? segmentosDaConfirmacao : segmentosDoCheckin).map((seg, i) => (
            <SegmentoDoCard key={seg.chave} segmento={seg} tom={TONS[i] ?? TONS[0]} />
          ))}
        </div>
      </div>

      <CardDeResumo
        valor={resumo.semDocumento}
        rotulo={c.semDocumento.titulo}
        icone={<IconeDocumento />}
        legenda={c.semDocumento.texto}
        destaque="negativo"
        filtro={
          aoFiltrar
            ? {
                pressionado: semDocumentoAtivo,
                aoAlternar: () => aoFiltrar(semDocumentoAtivo ? null : { tipo: "sem-documento" }),
                rotuloFalado: c.semDocumento.filtrar(resumo.semDocumento),
              }
            : undefined
        }
      />
    </section>
  );
}


function SegmentoDoCard({ segmento, tom }: { segmento: Segmento; tom: (typeof TONS)[number] }) {
  const corpo = (
    <>
      <span className="font-sub text-xl leading-none">{segmento.numero ?? SEM_NUMERO}</span>
      <span className="flex items-center gap-1.5 text-xs">
        <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${tom.ponto}`} />
        {segmento.rotulo}
      </span>
    </>
  );
  const base = `flex min-h-14 flex-col items-start justify-center rounded-md px-3 py-2 text-left ${tom.cor}`;
  if (!segmento.aoAlternar) return <div className={base}>{corpo}</div>;
  return (
    <button
      type="button"
      aria-pressed={segmento.ativo}
      aria-label={segmento.falado}
      onClick={segmento.aoAlternar}
      className={`${base} ${segmento.ativo ? `font-semibold ring-2 ring-inset ${tom.anel}` : ""}`}
    >
      <span aria-hidden="true" className="contents">
        {corpo}
      </span>
    </button>
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
