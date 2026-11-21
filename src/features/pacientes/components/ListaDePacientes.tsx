"use client";

import { type ReactNode, useEffect, useId, useRef, useState, useTransition } from "react";
import { DataState, type EstadoDeDados } from "@/components/ui/DataState";
import type { Resultado } from "@/lib/errors";
import type { Cursor, LinhaDePaciente, PaginaDePacientes } from "@/server/pacientes/porta";
import { termoPronto } from "../schema";
import { textos } from "../textos";
import { TabelaDePacientes } from "./TabelaDePacientes";

// Lista de Pacientes (MIG-43; PDD §10 e §10.1): a primeira página vem do servidor; a busca e as páginas seguintes, por
// server action. A busca por nome ou CPF vai no corpo do POST, nunca na URL (ADR 0001 §5). Os 4 estados pelo DataState.

type Props = {
  /** à direita da busca, como no simulador (o "+ Novo paciente") */
  acoes?: ReactNode;
  inicial: Resultado<PaginaDePacientes>;
  listar: (apos?: Cursor) => Promise<Resultado<PaginaDePacientes>>;
  buscar: (entrada: { termo: string }) => Promise<Resultado<LinhaDePaciente[]>>;
};

type Erro = { codigo: string; repetir: () => void };

const ESPERA_DA_BUSCA_MS = 300;

export function ListaDePacientes({ acoes, inicial, listar, buscar }: Props) {
  const idDaDica = useId();
  const [termo, setTermo] = useState("");
  const [carregando, iniciar] = useTransition();
  const [pagina, setPagina] = useState<PaginaDePacientes | null>(inicial.ok ? inicial.data : null);
  const [achados, setAchados] = useState<LinhaDePaciente[] | null>(null);
  const [erro, setErro] = useState<Erro | null>(inicial.ok ? null : { codigo: inicial.error.code, repetir: recarregar });
  const pedido = useRef(0); // só a resposta do último pedido vale (a busca dispara enquanto a pessoa digita)

  function executar<T>(acao: () => Promise<Resultado<T>>, aplicar: (dados: T) => void, repetir: () => void) {
    const n = ++pedido.current;
    setErro(null);
    iniciar(async () => {
      const r = await acao();
      if (n !== pedido.current) return;
      if (r.ok) aplicar(r.data);
      else setErro({ codigo: r.error.code, repetir });
    });
  }

  function recarregar() {
    executar(() => listar(), setPagina, recarregar);
  }

  function carregarMais(apos: Cursor) {
    executar(
      () => listar(apos),
      (mais) => setPagina((atual) => ({ ...mais, itens: [...(atual?.itens ?? []), ...mais.itens] })),
      () => carregarMais(apos),
    );
  }

  // busca enquanto digita, com uma espera curta; termo curto ou vazio volta para a lista já carregada
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(espera.current), []);

  function mudarTermo(novo: string) {
    setTermo(novo);
    clearTimeout(espera.current);
    if (!termoPronto(novo)) {
      pedido.current++; // descarta a busca que ainda estiver a caminho
      setAchados(null);
      if (pagina) setErro(null);
      return;
    }
    const t = novo.trim();
    const procurar = () => executar(() => buscar({ termo: t }), setAchados, procurar);
    espera.current = setTimeout(procurar, ESPERA_DA_BUSCA_MS);
  }

  const buscando = termoPronto(termo);
  const itens = (buscando ? achados : pagina?.itens) ?? [];
  const termoCurto = termo.trim().length > 0 && !buscando;
  const estado: EstadoDeDados = erro
    ? { tipo: "erro", codigo: erro.codigo, tentarDeNovo: erro.repetir }
    : itens.length > 0
      ? { tipo: "pronto" }
      : carregando || (buscando && achados === null)
        ? { tipo: "carregando" }
        : buscando
          ? { tipo: "sem-resultado", limparFiltros: () => mudarTermo("") }
          : { tipo: "vazio" };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex w-full max-w-[19rem] flex-col gap-1">
          <label className="relative block">
            <span className="sr-only">{textos.busca.rotulo}</span>
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-text-secondary">
              <IconeBusca />
            </span>
            <input
              type="search"
              value={termo}
              onChange={(e) => mudarTermo(e.target.value)}
              placeholder={textos.busca.placeholder}
              autoComplete="off"
              aria-describedby={termoCurto ? idDaDica : undefined}
              className="min-h-11 w-full rounded-full border border-border-functional bg-surface-raised pr-4 pl-11 text-text-primary placeholder:text-text-secondary"
            />
          </label>
          {termoCurto && (
            <p id={idDaDica} className="text-sm text-text-secondary">
              {textos.busca.curta}
            </p>
          )}
        </div>
        {acoes}
      </div>

      {/* a contagem da busca é anunciada ao leitor de tela; a lista em si não vira região viva */}
      <p role="status" className="sr-only">
        {buscando && achados !== null && !carregando ? textos.busca.achados(achados.length) : ""}
      </p>

      <div aria-busy={carregando}>
        <DataState estado={estado} rotulo={textos.estado} esqueleto={{ linhas: 6, alturaRem: 4 }} vazio={textos.vazio}>
          <TabelaDePacientes pacientes={itens} />
        </DataState>
      </div>

      {!buscando && !erro && pagina && pagina.itens.length > 0 && pagina.total !== null && (
        <p className="text-sm text-text-secondary">{textos.rodape(pagina.itens.length, pagina.total)}</p>
      )}

      {!buscando && !erro && pagina?.proxima && (
        <button
          type="button"
          disabled={carregando}
          onClick={() => pagina.proxima && carregarMais(pagina.proxima)}
          className="min-h-11 self-center rounded-md border border-border-functional bg-surface-raised px-5 font-medium text-text-primary hover:bg-surface-card disabled:opacity-60"
        >
          {textos.carregarMais}
        </button>
      )}
    </div>
  );
}

// lupa de traço fino (Guia de Design §7), decorativa
function IconeBusca() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" focusable="false">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}
