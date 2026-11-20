"use client";

import { useEffect, useId, useState } from "react";
import { DataState, type EstadoDeDados } from "@/components/ui/DataState";
import type { Resultado } from "@/lib/errors";
import type { DiaDaAgenda, FiltroDoDia } from "../schema";
import { dataPorExtenso } from "../formatos";
import { textos } from "../textos";
import { ALTURA_DA_LINHA_REM, TabelaDoDia } from "./TabelaDoDia";

// Visão Hoje da Agenda (PDD v206 §10.2.2), tela de pouso da recepção: a linha da data no topo, a busca por nome ou CPF
// e a tabela do dia com os quatro estados de dados pelo DataState. O primeiro dia vem do servidor; a busca vai por
// server action (POST): nome e CPF nunca na URL (ADR 0001 §5). Cards, avisos, Todos/Concluídos, filtros e ações
// entram nos PRs seguintes do MIG-41.

type Props = {
  inicial: Resultado<DiaDaAgenda>;
  buscar: (filtro: FiltroDoDia) => Promise<Resultado<DiaDaAgenda>>;
};

const ESPERA_DA_BUSCA_MS = 300;

export function AgendaHoje({ inicial, buscar }: Props) {
  const [busca, setBusca] = useState("");
  const [tocado, setTocado] = useState(false); // o primeiro dia já veio do servidor: só busca depois de mexer
  const [tentativa, setTentativa] = useState(0);
  const [resultado, setResultado] = useState<Resultado<DiaDaAgenda> | null>(inicial);
  const [dia, setDia] = useState<DiaDaAgenda | null>(inicial.ok ? inicial.data : null);
  const idDaBusca = useId();

  useEffect(() => {
    if (!tocado) return;
    let vigente = true; // resposta de uma busca já trocada é descartada
    const espera = setTimeout(async () => {
      setResultado(null);
      const termo = busca.trim();
      const r = await buscar(termo ? { busca: termo } : {});
      if (!vigente) return;
      setResultado(r);
      if (r.ok) setDia(r.data);
    }, ESPERA_DA_BUSCA_MS);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [busca, tentativa, tocado, buscar]);

  const mudarBusca = (valor: string) => {
    setTocado(true);
    setBusca(valor);
  };
  const estado = estadoDe(
    resultado,
    busca,
    () => mudarBusca(""),
    () => {
      setTocado(true);
      setTentativa((n) => n + 1);
    },
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Como no simulador: a linha da data com o ícone é o topo; o nome do módulo já está na aba (PDD §10). */}
      <header className="flex items-center gap-3">
        <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-md bg-surface-card">
          <IconeCalendario />
        </span>
        <h1 className="text-lg">
          <span className="sr-only">{textos.titulo}, </span>
          {dia && dataPorExtenso(dia.dataLocal)}
        </h1>
      </header>

      <div className="relative w-full max-w-sm">
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
          onChange={(evento) => mudarBusca(evento.target.value)}
          className="min-h-11 w-full rounded-full border border-border-functional bg-surface-raised pr-4 pl-11"
        />
      </div>

      <DataState
        estado={estado}
        rotulo={textos.rotuloDaLista}
        esqueleto={{ linhas: 5, alturaRem: ALTURA_DA_LINHA_REM }}
        vazio={textos.vazio}
      >
        {resultado?.ok && <TabelaDoDia linhas={resultado.data.linhas} fuso={resultado.data.fuso} />}
      </DataState>
    </div>
  );
}

/** O estado do DataState: carregando enquanto a busca não volta; sem resultado só quando há busca. */
export function estadoDe(
  resultado: Resultado<DiaDaAgenda> | null,
  busca: string,
  limparFiltros: () => void,
  tentarDeNovo: () => void,
): EstadoDeDados {
  if (!resultado) return { tipo: "carregando" };
  if (!resultado.ok) return { tipo: "erro", tentarDeNovo };
  if (resultado.data.linhas.length > 0) return { tipo: "pronto" };
  return busca.trim() ? { tipo: "sem-resultado", limparFiltros } : { tipo: "vazio" };
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
