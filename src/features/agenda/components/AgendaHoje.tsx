"use client";

import { useEffect, useId, useState } from "react";
import { DataState, type EstadoDeDados } from "@/components/ui/DataState";
import type { Resultado } from "@/lib/errors";
import { termoPronto, type DiaDaAgenda, type FiltroDoDia, type ResumoDaAgenda, type Status } from "../schema";
import { dataPorExtenso } from "../formatos";
import { textos } from "../textos";
import { ALTURA_DOS_CARDS_REM, CardsDoResumo, type FiltroDosCards } from "./CardsDoResumo";
import { ALTURA_DA_LINHA_REM, TabelaDoDia } from "./TabelaDoDia";

// Visão Hoje da Agenda (PDD v206 §10.2.2), tela de pouso da recepção: a linha da data no topo, a busca por nome ou CPF
// e a tabela do dia com os quatro estados de dados pelo DataState. O primeiro dia vem do servidor; a busca vai por
// server action (POST): nome e CPF nunca na URL (ADR 0001 §5). Os cards do topo filtram a lista pelo servidor (o
// "sem documento" é regra do banco). Avisos, Todos/Concluídos, filtros e ações entram nos PRs seguintes do MIG-41.

type Props = {
  inicial: Resultado<DiaDaAgenda>;
  resumoInicial: Resultado<ResumoDaAgenda>;
  buscar: (filtro: FiltroDoDia) => Promise<Resultado<DiaDaAgenda>>;
  resumir: () => Promise<Resultado<ResumoDaAgenda>>;
};

/** O filtro dos cards como texto estável, para o efeito da busca depender de um valor simples. */
const chaveDoFiltro = (f: FiltroDosCards) => (f === null ? "" : f.tipo === "status" ? `status:${f.status}` : "sem-documento");
function argumentosDoFiltro(chave: string): FiltroDoDia {
  if (chave.startsWith("status:")) return { status: [chave.slice("status:".length) as Status] };
  return chave === "sem-documento" ? { semDocumento: true } : {};
}

const ESPERA_DA_BUSCA_MS = 300;

export function AgendaHoje({ inicial, resumoInicial, buscar, resumir }: Props) {
  const [busca, setBusca] = useState("");
  const [filtroDosCards, setFiltroDosCards] = useState<FiltroDosCards>(null);
  const [resumo, setResumo] = useState<Resultado<ResumoDaAgenda> | null>(resumoInicial);
  const [tocado, setTocado] = useState(false); // o primeiro dia já veio do servidor: só busca depois de mexer
  const [tentativa, setTentativa] = useState(0);
  // A última lista que chegou fica na tela, com aria-busy, até a próxima resposta: a tabela não pisca a cada tecla.
  const [dia, setDia] = useState<DiaDaAgenda | null>(inicial.ok ? inicial.data : null);
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
      const r = await buscar({ ...(termo ? { busca: termo } : {}), ...argumentosDoFiltro(chave) });
      if (!vigente) return;
      setBuscando(false);
      setFalhou(!r.ok);
      if (r.ok) setDia(r.data);
    }, ESPERA_DA_BUSCA_MS);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [termo, pronto, chave, tentativa, tocado, buscar]);

  const mudarBusca = (valor: string) => {
    setTocado(true);
    setBusca(valor);
  };
  const filtrarPelosCards = (filtro: FiltroDosCards) => {
    setTocado(true);
    setFiltroDosCards(filtro);
  };
  const recarregarResumo = async () => {
    setResumo(null);
    setResumo(await resumir());
  };
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
    <div className="flex flex-col gap-6">
      {/* Como no simulador: a linha da data com o ícone é o topo; o nome do módulo já está na aba (PDD §10). Sem a
          data (falha no primeiro carregamento), o h1 mostra o nome do módulo. */}
      <header className="flex items-center gap-3">
        <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-md bg-surface-card">
          <IconeCalendario />
        </span>
        <h1 className="text-lg">
          {dia ? (
            <>
              <span className="sr-only">{textos.titulo}, </span>
              {dataPorExtenso(dia.dataLocal)}
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
        {resumo?.ok && <CardsDoResumo resumo={resumo.data} filtro={filtroDosCards} aoFiltrar={filtrarPelosCards} />}
      </DataState>

      <div className="flex w-full max-w-sm flex-col gap-1">
        <div className="relative">
          <label htmlFor={idDaBusca} className="sr-only">
            {textos.busca.rotulo}
          </label>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-text-secondary"
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
            className="min-h-11 w-full rounded-full border border-border-functional bg-surface-raised pr-4 pl-11"
          />
        </div>
        {!pronto && (
          <p id={idDaDica} className="pl-4 text-sm text-text-secondary">
            {textos.busca.termoCurto}
          </p>
        )}
      </div>

      <DataState
        estado={estado}
        rotulo={textos.rotuloDaLista}
        esqueleto={{ linhas: 5, alturaRem: ALTURA_DA_LINHA_REM }}
        vazio={textos.vazio}
      >
        {dia && <TabelaDoDia linhas={dia.linhas} fuso={dia.fuso} ocupado={buscando} />}
      </DataState>
    </div>
  );
}

/**
 * O estado do DataState. Carregando só quando ainda não há lista para mostrar (a de antes fica com aria-busy); sem
 * resultado só com busca; erro com tentar de novo.
 */
export function estadoDe(e: {
  dia: DiaDaAgenda | null;
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
