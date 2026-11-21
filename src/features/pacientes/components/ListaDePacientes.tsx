"use client";

import { type ReactNode, useEffect, useId, useRef, useState, useTransition } from "react";
import { DataState, type EstadoDeDados } from "@/components/ui/DataState";
import type { Resultado } from "@/lib/errors";
import type { Cursor, FiltroDaLista, LinhaDePaciente, PaginaDePacientes } from "@/server/pacientes/porta";
import { FILTROS, termoPronto } from "../schema";
import { textos } from "../textos";
import { TabelaDePacientes } from "./TabelaDePacientes";

// Lista de Pacientes (MIG-43; PDD §10 e §10.1): a primeira página vem do servidor; a busca e as páginas seguintes, por
// server action. A busca por nome ou CPF vai no corpo do POST, nunca na URL (ADR 0001 §5). Os 4 estados pelo DataState.

type Props = {
  /** à direita da busca, como no simulador (o "+ Novo paciente") */
  acoes?: ReactNode;
  inicial: Resultado<PaginaDePacientes>;
  listar: (apos?: Cursor, filtro?: FiltroDaLista) => Promise<Resultado<PaginaDePacientes>>;
  buscar: (entrada: { termo: string; filtro?: FiltroDaLista }) => Promise<Resultado<LinhaDePaciente[]>>;
};

/** `repetir` ausente: o erro da primeira página, que vem do servidor; o "tentar de novo" relê a lista. */
type Erro = { codigo: string; repetir?: () => void };

const ESPERA_DA_BUSCA_MS = 300;
const ROTULO_DO_FILTRO: Record<FiltroDaLista, string> = {
  outra_clinica: textos.filtros.outraClinica,
  atendimento_hoje: textos.filtros.atendimentoHoje,
  arquivados: textos.filtros.arquivados,
};

export function ListaDePacientes({ acoes, inicial, listar, buscar }: Props) {
  const idDaDica = useId();
  const [termo, setTermo] = useState("");
  const [carregando, iniciar] = useTransition();
  const [pagina, setPagina] = useState<PaginaDePacientes | null>(inicial.ok ? inicial.data : null);
  const [achados, setAchados] = useState<LinhaDePaciente[] | null>(null);
  const [erro, setErro] = useState<Erro | null>(inicial.ok ? null : { codigo: inicial.error.code });
  const pedido = useRef(0); // só a resposta do último pedido vale (a busca dispara enquanto a pessoa digita)
  // filtro da captura 11: vale para a lista, a busca e o "Carregar mais"; os contadores do menu vêm do banco, contados
  // antes do filtro, e ficam os últimos conhecidos quando a página volta vazia
  const [filtro, setFiltro] = useState<FiltroDaLista | null>(null);
  const [contadores, setContadores] = useState(inicial.ok ? inicial.data.contadores : null);
  const [menuAberto, setMenuAberto] = useState(false);
  const idDoMenu = useId();
  const caixaDoFiltro = useRef<HTMLDivElement>(null);
  const botaoDoFiltro = useRef<HTMLButtonElement>(null);

  // o menu fecha no Esc (o foco volta ao botão) e no clique fora
  useEffect(() => {
    if (!menuAberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixaDoFiltro.current?.contains(e.target as Node)) setMenuAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [menuAberto]);

  function receberPagina(nova: PaginaDePacientes) {
    setPagina(nova);
    if (nova.contadores) setContadores(nova.contadores);
  }

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

  function recarregar(f: FiltroDaLista | null = filtro) {
    executar(() => (f ? listar(undefined, f) : listar()), receberPagina, () => recarregar(f));
  }

  function carregarMais(apos: Cursor) {
    const f = filtro;
    executar(
      () => (f ? listar(apos, f) : listar(apos)),
      (mais) => {
        if (mais.contadores) setContadores(mais.contadores);
        setPagina((atual) => ({ ...mais, itens: [...(atual?.itens ?? []), ...mais.itens] }));
      },
      () => carregarMais(apos),
    );
  }

  function aplicarFiltro(f: FiltroDaLista | null) {
    setFiltro(f);
    setMenuAberto(false);
    botaoDoFiltro.current?.focus();
    if (termoPronto(termo)) procurarCom(termo.trim(), f);
    else recarregar(f);
  }

  function procurarCom(t: string, f: FiltroDaLista | null) {
    const procurar = () => executar(() => buscar(f ? { termo: t, filtro: f } : { termo: t }), setAchados, procurar);
    procurar();
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
    espera.current = setTimeout(() => procurarCom(t, filtro), ESPERA_DA_BUSCA_MS);
  }

  const buscando = termoPronto(termo);
  const itens = (buscando ? achados : pagina?.itens) ?? [];
  const termoCurto = termo.trim().length > 0 && !buscando;
  const estado: EstadoDeDados = erro
    ? { tipo: "erro", codigo: erro.codigo, tentarDeNovo: erro.repetir ?? (() => recarregar()) }
    : itens.length > 0
      ? { tipo: "pronto" }
      : carregando || (buscando && achados === null)
        ? { tipo: "carregando" }
        : buscando || filtro
          ? {
              tipo: "sem-resultado",
              limparFiltros: () => {
                mudarTermo("");
                if (filtro) aplicarFiltro(null);
              },
            }
          : { tipo: "vazio" };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex w-full max-w-[13.75rem] flex-col gap-1">
          <label className="relative block">
            <span className="sr-only">{textos.busca.rotulo}</span>
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-text-secondary">
              <IconeBusca />
            </span>
            <input
              type="search"
              value={termo}
              onChange={(e) => mudarTermo(e.target.value)}
              placeholder={textos.busca.placeholder}
              autoComplete="off"
              aria-describedby={termoCurto ? idDaDica : undefined}
              className="h-[2.1875rem] w-full rounded-full border border-border-functional bg-surface-raised pr-3 pl-9 text-corpo text-text-primary placeholder:text-text-secondary"
            />
          </label>
          {termoCurto && (
            <p id={idDaDica} className="text-xs text-text-secondary">
              {textos.busca.curta}
            </p>
          )}
        </div>
        <div ref={caixaDoFiltro} className="relative flex items-center gap-2" onKeyDown={(e) => {
          if (e.key === "Escape" && menuAberto) {
            setMenuAberto(false);
            botaoDoFiltro.current?.focus();
          }
        }}>
          {/* captura 11: o botão do funil ao lado da busca, com o menu dos três filtros e os contadores */}
          <button
            ref={botaoDoFiltro}
            type="button"
            aria-label={textos.filtros.rotulo}
            aria-expanded={menuAberto}
            aria-controls={idDoMenu}
            onClick={() => setMenuAberto((a) => !a)}
            className={`flex size-11 items-center justify-center rounded-full border border-border-functional medium:size-[2.1875rem] ${
              filtro ? "bg-surface-card text-text-primary" : "bg-surface-raised text-text-secondary"
            }`}
          >
            <IconeFiltro />
          </button>
          {menuAberto && (
            <ul id={idDoMenu} aria-label={textos.filtros.menu} className="absolute top-full left-0 z-10 mt-2 flex w-64 flex-col rounded-md border border-border bg-surface-raised p-1.5 shadow-md">
              {FILTROS.map((f) => (
                <li key={f}>
                  <button
                    type="button"
                    aria-pressed={filtro === f}
                    onClick={() => aplicarFiltro(filtro === f ? null : f)}
                    className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-sm px-3 text-left text-corpo hover:bg-surface-card medium:min-h-9 ${
                      filtro === f ? "font-semibold" : ""
                    }`}
                  >
                    {ROTULO_DO_FILTRO[f]}
                    {contadores && (
                      <span className="text-xs text-text-secondary">
                        <span aria-hidden="true">{contadores[f]}</span>
                        <span className="sr-only">{textos.filtros.contagem(contadores[f])}</span>
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {filtro && (
            <button
              type="button"
              onClick={() => aplicarFiltro(null)}
              className="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-text-primary hover:bg-surface-card medium:min-h-[2.1875rem]"
            >
              <span aria-hidden="true">✕</span>
              {textos.filtros.limpar}
            </button>
          )}
        </div>
        <div className="ml-auto">{acoes}</div>
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

      {!buscando && !filtro && !erro && pagina && pagina.itens.length > 0 && pagina.total !== null && (
        <p className="text-xs text-text-secondary">{textos.rodape(pagina.itens.length, pagina.total)}</p>
      )}

      {!buscando && !erro && pagina?.proxima && (
        <button
          type="button"
          disabled={carregando}
          onClick={() => pagina.proxima && carregarMais(pagina.proxima)}
          className="h-9 self-center rounded-md border border-border-functional bg-surface-raised px-4 text-corpo font-medium text-text-primary hover:bg-surface-card disabled:opacity-60"
        >
          {textos.carregarMais}
        </button>
      )}
    </div>
  );
}

// funil de traço fino (Guia de Design §7), decorativo; o rótulo é do botão
function IconeFiltro() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
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
