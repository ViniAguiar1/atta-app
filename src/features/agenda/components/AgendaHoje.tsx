"use client";

import { useEffect, useId, useState } from "react";
import { DataState, type EstadoDeDados } from "@/components/ui/DataState";
import { useAcoesDaLinha } from "@/components/agenda/useAcoesDaLinha";
import type { Resultado } from "@/lib/errors";
import {
  termoPronto,
  type DiaDaAgenda,
  type EntradaDaAcao,
  type FiltroDoDia,
  type FiltroDoPeriodo,
  type FiltroDosConcluidos,
  type ListaDaAgenda,
  type PeriodoConcluidos,
  type ResumoDaAgenda,
  type Status,
} from "../schema";
import { dataPorExtenso } from "../formatos";
import { textos } from "../textos";
import { ALTURA_DOS_CARDS_REM, CardsDoResumo, type FiltroDosCards } from "./CardsDoResumo";
import { ALTURA_DA_LINHA_REM, TabelaDoDia } from "./TabelaDoDia";

// Visão Hoje da Agenda (PDD v206 §10.2.2), tela de pouso da recepção: a linha da data no topo, a busca por nome ou CPF
// e a tabela do dia com os quatro estados de dados pelo DataState. O primeiro dia vem do servidor; a busca vai por
// server action (POST): nome e CPF nunca na URL (ADR 0001 §5). Os cards do topo filtram a lista pelo servidor (o
// "sem documento" é regra do banco). O segmento troca entre Hoje, Todos (com a coluna Data) e Concluídos (semana ou
// mês; Ausente como "Não realizado"), cada um na sua leitura. Avisos, filtros e ações entram nos PRs seguintes.

export type Visao = "hoje" | "todos" | "concluidos";

type Props = {
  inicial: Resultado<DiaDaAgenda>;
  resumoInicial: Resultado<ResumoDaAgenda>;
  buscar: (filtro: FiltroDoDia) => Promise<Resultado<DiaDaAgenda>>;
  buscarPeriodo: (filtro: FiltroDoPeriodo) => Promise<Resultado<ListaDaAgenda>>;
  buscarConcluidos: (filtro: FiltroDosConcluidos) => Promise<Resultado<ListaDaAgenda>>;
  resumir: () => Promise<Resultado<ResumoDaAgenda>>;
  /** grava uma ação da linha (server action); sem ela, a coluna Ações não aparece */
  executar?: (entrada: EntradaDaAcao) => Promise<Resultado<null>>;
};

/** O filtro dos cards como texto estável, para o efeito da busca depender de um valor simples. */
const chaveDoFiltro = (f: FiltroDosCards) => (f === null ? "" : f.tipo === "status" ? `status:${f.status}` : "sem-documento");
function argumentosDoFiltro(chave: string): FiltroDoDia {
  if (chave.startsWith("status:")) return { status: [chave.slice("status:".length) as Status] };
  return chave === "sem-documento" ? { semDocumento: true } : {};
}

const ESPERA_DA_BUSCA_MS = 300;

export function AgendaHoje({ inicial, resumoInicial, buscar, buscarPeriodo, buscarConcluidos, resumir, executar }: Props) {
  const [visao, setVisao] = useState<Visao>("hoje");
  // Concluídos abre em "Esta semana"; "Este mês" e "Todo o período" vêm no painel Filtros (captura 37, PR dos filtros)
  const periodo: PeriodoConcluidos = "semana";
  const [busca, setBusca] = useState("");
  const [filtroDosCards, setFiltroDosCards] = useState<FiltroDosCards>(null);
  const [resumo, setResumo] = useState<Resultado<ResumoDaAgenda> | null>(resumoInicial);
  const [tocado, setTocado] = useState(false); // o primeiro dia já veio do servidor: só busca depois de mexer
  const [tentativa, setTentativa] = useState(0);
  // A última lista que chegou fica na tela, com aria-busy, até a próxima resposta: a tabela não pisca a cada tecla.
  const [dia, setDia] = useState<ListaDaAgenda | null>(inicial.ok ? inicial.data : null);
  const [falhou, setFalhou] = useState(!inicial.ok);
  const [buscando, setBuscando] = useState(false);
  const idDaBusca = useId();
  const idDaDica = useId();

  const termo = busca.trim();
  const pronto = termo === "" || termoPronto(termo);
  const chave = chaveDoFiltro(filtroDosCards);

  useEffect(() => {
    if (!tocado || !pronto) return; // termo curto ou CPF pela metade não sai
    let vigente = true; // resposta de uma busca já trocada é descartada
    const espera = setTimeout(async () => {
      setBuscando(true);
      const comBusca = termo ? { busca: termo } : {};
      const r =
        visao === "hoje"
          ? await buscar({ ...comBusca, ...argumentosDoFiltro(chave) })
          : visao === "todos"
            ? await buscarPeriodo(comBusca)
            : await buscarConcluidos({ periodo, ...comBusca });
      if (!vigente) return;
      setBuscando(false);
      setFalhou(!r.ok);
      if (r.ok) setDia(r.data);
    }, ESPERA_DA_BUSCA_MS);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [termo, pronto, chave, visao, periodo, tentativa, tocado, buscar, buscarPeriodo, buscarConcluidos]);

  const mudarBusca = (valor: string) => {
    setTocado(true);
    setBusca(valor);
  };
  const mudarVisao = (nova: Visao) => {
    setTocado(true);
    setFiltroDosCards(null); // os filtros dos cards valem na visão Hoje (o painel Filtros entra depois)
    setVisao(nova);
  };
  const filtrarPelosCards = (filtro: FiltroDosCards) => {
    setTocado(true);
    setFiltroDosCards(filtro);
  };
  const recarregarResumo = async () => {
    setResumo(null);
    setResumo(await resumir());
  };
  // Ação da linha (PDD §10.2.2): o hook comum (components/agenda, também usado na Pasta) grava pela server action,
  // anuncia o resultado e abre o diálogo de motivo; aqui, depois de gravar, relê a lista e os cards.
  const { acionando, aviso, acionar, dialogoDaAcao } = useAcoesDaLinha({
    executar,
    depoisDeGravar: () => {
      setTocado(true);
      setTentativa((n) => n + 1);
      void recarregarResumo();
    },
  });
  const estado = estadoDe({
    dia,
    falhou,
    buscando,
    comBusca: (termo !== "" && pronto) || filtroDosCards !== null,
    limparFiltros: () => {
      mudarBusca("");
      setFiltroDosCards(null);
    },
    tentarDeNovo: () => {
      setTocado(true);
      setTentativa((n) => n + 1);
    },
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Como no simulador: a linha da data com o ícone é o topo; o nome do módulo já está na aba (PDD §10). Sem a
          data (falha no primeiro carregamento), o h1 mostra o nome do módulo. */}
      <header className="flex items-center gap-3">
        <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-md bg-brand/10 text-brand">
          <IconeCalendario />
        </span>
        <h1 className="text-base">
          {dia ? (
            <>
              <span className="sr-only">{textos.titulo}, </span>
              {dataPorExtenso(dia.hojeLocal)}
            </>
          ) : (
            textos.titulo
          )}
        </h1>
      </header>

      <DataState
        estado={
          resumo === null
            ? { tipo: "carregando" }
            : resumo.ok
              ? { tipo: "pronto" }
              : { tipo: "erro", tentarDeNovo: () => void recarregarResumo() }
        }
        rotulo={textos.cards.rotulo}
        esqueleto={{ linhas: 1, alturaRem: ALTURA_DOS_CARDS_REM }}
        vazio={{ titulo: textos.cards.rotulo }}
      >
        {resumo?.ok && (
          <CardsDoResumo
            resumo={resumo.data}
            visao={visao}
            filtro={filtroDosCards}
            aoFiltrar={visao === "hoje" ? filtrarPelosCards : undefined}
          />
        )}
      </DataState>

      {/* Linha de controles do simulador (captura 01): o segmento das visões e a busca lado a lado. */}
      <div className="flex flex-wrap items-start gap-3">
        <SegmentoDasVisoes visao={visao} aoMudar={mudarVisao} />
        <div className="flex w-full max-w-[17rem] flex-col gap-1">
        <div className="relative">
          <label htmlFor={idDaBusca} className="sr-only">
            {textos.busca.rotulo}
          </label>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-text-secondary"
          >
            <IconeBusca />
          </span>
          <input
            id={idDaBusca}
            type="search"
            autoComplete="off"
            maxLength={80}
            placeholder={textos.busca.placeholder}
            value={busca}
            aria-describedby={pronto ? undefined : idDaDica}
            onChange={(evento) => mudarBusca(evento.target.value)}
            className="min-h-11 w-full rounded-full border border-border-functional bg-surface-raised pr-4 pl-10 text-corpo medium:min-h-8"
          />
        </div>
        {!pronto && (
          <p id={idDaDica} className="pl-4 text-xs text-text-secondary">
            {textos.busca.termoCurto}
          </p>
        )}
        </div>
      </div>

      {/* resultado da ação: status educado no sucesso, alerta no erro (sempre no DOM, para o leitor anunciar) */}
      <p role="status" className="sr-only">
        {aviso?.tipo === "ok" ? aviso.texto : ""}
      </p>
      {aviso?.tipo === "erro" && (
        <p role="alert" className="rounded-md border border-status-negative bg-status-negative/10 px-4 py-2 text-corpo text-status-negative">
          {aviso.texto}
        </p>
      )}

      <DataState
        estado={estado}
        rotulo={textos.rotuloDaLista}
        esqueleto={{ linhas: 5, alturaRem: ALTURA_DA_LINHA_REM }}
        vazio={textos.vazioDa[visao]}
      >
        {dia && (
          <TabelaDoDia
            linhas={dia.linhas}
            fuso={dia.fuso}
            ocupado={buscando}
            comData={visao !== "hoje"}
            hojeLocal={dia.hojeLocal}
            ausenteComoNaoRealizado={visao === "concluidos"}
            ordem={visao === "concluidos" ? "descending" : "ascending"}
            aoAcionar={executar ? (linha, acao) => void acionar(linha, acao) : undefined}
            acionando={acionando}
          />
        )}
        {dia && visao !== "hoje" && dia.linhas.length > 0 && (
          <p className="text-right text-corpo text-text-secondary">
            {visao === "todos" ? textos.rodape.todos(dia.linhas.length) : textos.rodape.concluidos(dia.linhas.length)}
          </p>
        )}
      </DataState>

      {dialogoDaAcao}
    </div>
  );
}

/**
 * O estado do DataState. Carregando só quando ainda não há lista para mostrar (a de antes fica com aria-busy); sem
 * resultado só com busca; erro com tentar de novo.
 */
export function estadoDe(e: {
  dia: ListaDaAgenda | null;
  falhou: boolean;
  buscando: boolean;
  comBusca: boolean;
  limparFiltros: () => void;
  tentarDeNovo: () => void;
}): EstadoDeDados {
  if (e.buscando && !e.dia) return { tipo: "carregando" };
  if (e.falhou && !e.buscando) return { tipo: "erro", tentarDeNovo: e.tentarDeNovo };
  if (!e.dia) return { tipo: "carregando" };
  if (e.dia.linhas.length > 0) return { tipo: "pronto" };
  if (e.buscando) return { tipo: "carregando" };
  return e.comBusca ? { tipo: "sem-resultado", limparFiltros: e.limparFiltros } : { tipo: "vazio" };
}

/** Hoje / Todos / Concluídos (PDD §10.2.2; simulador, captura 01): pílula cinza com a visão ativa em branco. */
function SegmentoDasVisoes({ visao, aoMudar }: { visao: Visao; aoMudar: (v: Visao) => void }) {
  const v = textos.visoes;
  const itens: { valor: Visao; rotulo: string }[] = [
    { valor: "hoje", rotulo: v.hoje },
    { valor: "todos", rotulo: v.todos },
    { valor: "concluidos", rotulo: v.concluidos },
  ];
  return <Segmento rotulo={v.rotulo} itens={itens} ativo={visao} aoMudar={aoMudar} />;
}

function Segmento<T extends string>({
  rotulo,
  itens,
  ativo,
  aoMudar,
}: {
  rotulo: string;
  itens: { valor: T; rotulo: string }[];
  ativo: T;
  aoMudar: (valor: T) => void;
}) {
  return (
    <div role="group" aria-label={rotulo} className="inline-flex rounded-full bg-surface-card p-1">
      {itens.map((item) => {
        const pressionado = item.valor === ativo;
        return (
          <button
            key={item.valor}
            type="button"
            aria-pressed={pressionado}
            onClick={() => aoMudar(item.valor)}
            className={`min-h-11 rounded-full px-3.5 text-corpo medium:min-h-8 ${
              pressionado ? "bg-surface-raised font-medium text-text-primary shadow-sm" : "text-text-secondary"
            }`}
          >
            {item.rotulo}
          </button>
        );
      })}
    </div>
  );
}

// Ícones de traço fino (Guia de Design §7), decorativos.
function IconeCalendario() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" focusable="false">
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

function IconeBusca() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" focusable="false">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}
