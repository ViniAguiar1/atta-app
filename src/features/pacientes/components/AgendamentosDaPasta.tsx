"use client";

import { useId, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { ChipDeStatus, SeloAtrasado } from "@/components/agenda/ChipDeStatus";
import { CartaoDeSecao } from "@/components/ui/CartaoDeSecao";
import { DataState } from "@/components/ui/DataState";
import type { Resultado } from "@/lib/errors";
import type { AgendamentoDaPasta, AgendamentosDaPasta as Pagina } from "@/server/pacientes/porta";
import { textos } from "../textos";

// "Agendamentos e documentos" da Pasta (Simulador ATTA-in, capturas 13 e 14; PDD §10, JF-05, e §10.2.2: os concluídos
// antigos ficam só na Pasta). Do mais novo ao mais antigo, pelo api.patient_folder_appointments (#227). A linha usa o
// tipo e o chip de status da Agenda (src/lib/agenda e src/components/agenda, decisão do TLF). Ficam para depois: o
// menu ⋮ (ações da Agenda, PR C do MIG-41), os botões das pendências e as abas Termos, Formulário de Saúde, Docs
// Clínicos e Linha do tempo, que dependem de APIs que ainda não existem: aba só aparece quando funciona.

const t = textos.pasta.agendamentos;
type Mais = (e: { id: string; cursor: string }) => Promise<Resultado<Pagina>>;
type Aba = "agendamentos" | "pendencias";
const ABAS: Aba[] = ["agendamentos", "pendencias"];

const formatador = (fuso: string, opcoes: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, ...opcoes });
const dataDe = (iso: string, fuso: string) => formatador(fuso, { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
const horaDe = (iso: string, fuso: string) => formatador(fuso, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

// captura 13: "a regularizar" com o ponto de atenção (status-pending); "obrigatória" com o ponto vinho (status-negative)
function ChipDePendencia({ texto, ponto }: { texto: string; ponto: "bg-status-pending" | "bg-status-negative" }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-card px-2 py-0.5 text-rotulo font-semibold whitespace-nowrap text-text-primary">
      <span aria-hidden="true" className={`size-1.5 rounded-full ${ponto}`} />
      {texto}
    </span>
  );
}

function Marcos({ a, fuso }: { a: AgendamentoDaPasta; fuso: string }) {
  const m = a.marcos;
  const partes = [
    m.checkin && `${t.marco.checkin} ${horaDe(m.checkin, fuso)}`,
    m.pronto && `${t.marco.pronto} ${horaDe(m.pronto, fuso)}`,
    m.emAtendimento && `${t.marco.emAtendimento} ${horaDe(m.emAtendimento, fuso)}`,
    m.concluido && `${t.marco.concluido} ${horaDe(m.concluido, fuso)}`,
  ].filter(Boolean);
  return <p className="text-rotulo text-text-secondary">{partes.length ? partes.join(" · ") : t.semMarcos}</p>;
}

// captura 13: data e hora à esquerda; procedimento, profissional, chips e marcos no meio; pendência e contagens à direita
function Agendamento({ a, fuso }: { a: AgendamentoDaPasta; fuso: string }) {
  return (
    <li className="flex flex-wrap gap-x-6 gap-y-2 rounded-md border border-border bg-surface-raised p-3">
      {/* em 390 px a data e a hora ficam numa linha em cima; a partir do medium, empilhadas à esquerda */}
      <p className="flex w-full items-baseline gap-2 medium:w-24 medium:shrink-0 medium:flex-col medium:items-start medium:gap-0">
        <span className="text-xs text-text-secondary">{dataDe(a.inicio, fuso)}</span>
        <span className="font-sub text-horario">{horaDe(a.inicio, fuso)}</span>
      </p>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm font-semibold">{a.servicos.map((s) => s.nome).join(", ")}</p>
        <p className="text-xs text-text-secondary">{a.profissional.nomeExibicao}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <ChipDeStatus status={a.status} compacto />
          {a.atrasado && <SeloAtrasado compacto />}
          {a.pendencia && <ChipDePendencia texto={t.pendenciaARegularizar} ponto="bg-status-pending" />}
        </div>
        <Marcos a={a} fuso={fuso} />
      </div>
      <div className="flex w-full flex-col items-start gap-1 medium:w-auto medium:items-end">
        {a.pendencia?.obrigatoria && <ChipDePendencia texto={t.pendenciaObrigatoria} ponto="bg-status-negative" />}
        <p className="text-rotulo text-text-secondary">{t.contagem(a.termos, a.docsClinicos)}</p>
      </div>
    </li>
  );
}

// triângulo de alerta de traço fino (Guia de Design §7), decorativo
function Alerta() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 4 2.5 20h19L12 4ZM12 10v4M12 17h.01" />
    </svg>
  );
}

// captura 14: cabeçalho com o alerta, o título, a linha do atendimento e o status; o aviso em caixa e o "Como resolver"
function Pendencia({ a, fuso }: { a: AgendamentoDaPasta; fuso: string }) {
  return (
    <li className="overflow-hidden rounded-md border border-border border-l-4 border-l-status-negative bg-surface-raised">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface-app px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-border bg-surface-raised text-status-pending">
          <Alerta />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-corpo">{t.termoNaoAssinado}</p>
          <p className="text-rotulo text-text-secondary">
            {a.servicos.map((s) => s.nome).join(", ")} · {dataDe(a.inicio, fuso)} às {horaDe(a.inicio, fuso)} · {a.profissional.nomeExibicao}
          </p>
        </div>
        <ChipDeStatus status={a.status} compacto />
      </div>
      <div className="flex flex-col gap-3 p-4 text-xs">
        <p className="flex items-start gap-2 rounded-md border border-border border-l-4 border-l-status-negative p-3">
          <span className="text-status-negative">
            <Alerta />
          </span>
          {t.termoNaoAssinadoTexto}
        </p>
        <p className="rounded-md bg-surface-app p-3">
          <strong>{t.comoResolver}</strong> {t.comoResolverTexto}
        </p>
      </div>
    </li>
  );
}

export function AgendamentosDaPasta({ id, inicial, mais }: { id: string; inicial: Pagina; mais: Mais }) {
  const [pagina, setPagina] = useState(inicial);
  const [aba, setAba] = useState<Aba>("agendamentos");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, iniciar] = useTransition();
  const base = useId();
  const botoes = useRef<Record<Aba, HTMLButtonElement | null>>({ agendamentos: null, pendencias: null });

  const pendentes = pagina.itens.filter((a) => a.pendencia);
  const rotulo = { agendamentos: t.aba.agendamentos(pagina.totais.agendamentos), pendencias: t.aba.pendencias(pagina.totais.pendencias) };

  // abas do padrão ARIA: setas trocam a aba e levam o foco junto
  const teclado = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const proxima = ABAS[(ABAS.indexOf(aba) + (e.key === "ArrowRight" ? 1 : ABAS.length - 1)) % ABAS.length]!;
    setAba(proxima);
    botoes.current[proxima]?.focus();
  };

  const carregarMais = () =>
    iniciar(async () => {
      if (!pagina.proximo) return;
      const r = await mais({ id, cursor: pagina.proximo });
      if (!r.ok) return setErro(r.error.code);
      setErro(null);
      setPagina({ ...r.data, itens: [...pagina.itens, ...r.data.itens] });
    });

  return (
    <CartaoDeSecao titulo={t.titulo} subtitulo={t.subtitulo} icone="🗂️" compacto>
      <div role="tablist" aria-label={t.abas} onKeyDown={teclado} className="flex gap-0.5 overflow-x-auto border-b border-border px-3">
        {ABAS.map((a) => (
          <button
            key={a}
            ref={(el) => {
              botoes.current[a] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-${a}`}
            aria-selected={aba === a}
            aria-controls={`${base}-${a}-painel`}
            tabIndex={aba === a ? 0 : -1}
            onClick={() => setAba(a)}
            className={`-mb-px min-h-11 border-b-2 px-3 text-xs whitespace-nowrap ${
              aba === a ? "border-brand font-semibold text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {rotulo[a]}
          </button>
        ))}
      </div>
      {/* os dois painéis ficam no DOM (o inativo com hidden), para o aria-controls de cada aba apontar para o seu */}
      <div role="tabpanel" id={`${base}-agendamentos-painel`} aria-labelledby={`${base}-agendamentos`} hidden={aba !== "agendamentos"}>
        <DataState
          estado={pagina.itens.length ? { tipo: "pronto" } : { tipo: "vazio" }}
          rotulo={t.estado}
          esqueleto={{ linhas: 2, alturaRem: 7 }}
          vazio={t.vazio}
        >
          <ul className="flex flex-col gap-3">
            {pagina.itens.map((a) => (
              <Agendamento key={a.id} a={a} fuso={pagina.fuso} />
            ))}
          </ul>
        </DataState>
      </div>
      <div role="tabpanel" id={`${base}-pendencias-painel`} aria-labelledby={`${base}-pendencias`} hidden={aba !== "pendencias"}>
        <DataState
          estado={pendentes.length || pagina.proximo ? { tipo: "pronto" } : { tipo: "vazio" }}
          rotulo={t.estado}
          esqueleto={{ linhas: 1, alturaRem: 9 }}
          vazio={t.semPendencia}
        >
          <ul className="flex flex-col gap-3">
            {pendentes.map((a) => (
              <Pendencia key={a.id} a={a} fuso={pagina.fuso} />
            ))}
          </ul>
        </DataState>
      </div>
      {erro && (
        // o "tentar de novo" repete o carregar mais, sem recarregar a página
        <DataState estado={{ tipo: "erro", tentarDeNovo: carregarMais, codigo: erro }} rotulo={t.estado} esqueleto={{ linhas: 1, alturaRem: 3 }} vazio={t.vazio}>
          {null}
        </DataState>
      )}
      {/* nas duas abas: o número das Pendências é o total do banco, e a lista sai das páginas carregadas */}
      {pagina.proximo && !erro && (
        <button
          type="button"
          onClick={carregarMais}
          disabled={carregando}
          className="min-h-11 w-fit self-center rounded-md border border-border-functional px-4 text-corpo font-medium disabled:opacity-60 medium:min-h-9"
        >
          {t.carregarMais}
        </button>
      )}
    </CartaoDeSecao>
  );
}
