"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Monograma } from "@/components/ui/Monograma";
import { iniciais } from "@/lib/texto/iniciais";
import { textos as t } from "../textos";
import type { SessaoDoPainel } from "../sessao";
import { abaAtiva, abasDoPapel } from "../abas";

// Barra de módulos do painel, pixel perfect com o Simulador ATTA-in (print 28 do dono; decisão de 20/11, PLANO "Abas e
// fidelidade ao simulador"): símbolo + nome da clínica; as 6 abas (Métricas e Configurações só para o ADMIN) com o
// separador antes do grupo de gestão; a aba ativa em brand-active (#5f5256, o tom do simulador) colada embaixo, com os
// cantos de cima arredondados; à direita, o sino com o contador e as iniciais + o nome da pessoa. As abas aparecem
// sempre: a tela sem dado real mostra o estado vazio do design.
// O monograma alterna a barra para a clara (Guia §4.1), com rótulo que diz a próxima ação; vale enquanto a página está
// aberta. Foco: na barra escura o anel vira o claro (on-brand). Abaixo de large as abas descem para uma linha própria,
// rolável no celular; de large em diante ficam na linha da barra, e quem cede espaço é o nome da clínica (reticências).
type Props = {
  sessao: SessaoDoPainel;
  /** Server action que encerra a sessão (login/actions.ts); vem do layout, para a feature não importar rota. */
  acaoSair: () => Promise<void>;
  contadores?: Record<string, number>;
};

export function BarraDoPainel({ sessao, acaoSair, contadores = {} }: Props) {
  const [clara, setClara] = useState(false);
  const caminho = usePathname();
  const ativa = abaAtiva(caminho);
  const abas = abasDoPapel(sessao.papel);

  const barra = clara ? "border-b border-brand/32 bg-surface-app text-brand" : "bg-brand text-on-brand [&_:focus-visible]:outline-on-brand";
  const abaAtivaCls = clara ? "bg-brand/5 underline decoration-brand/45 decoration-1 underline-offset-8" : "bg-brand-active font-semibold text-on-brand";
  const contadorCls = clara ? "bg-brand text-on-brand" : "bg-on-brand text-brand";
  const abaInativa = clara ? "text-brand hover:bg-brand/5" : "text-on-brand/78 hover:bg-on-brand/10 hover:text-on-brand";

  // No celular a linha das abas rola de lado: ao abrir, a aba atual fica à vista (centrada), sem rolar a página.
  const linhaDasAbas = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = linhaDasAbas.current;
    const atual = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !atual || nav.scrollWidth <= nav.clientWidth) return;
    const n = nav.getBoundingClientRect();
    const a = atual.getBoundingClientRect();
    if (a.left >= n.left && a.right <= n.right) return;
    nav.scrollLeft += a.left - n.left - (n.width - a.width) / 2;
  }, [ativa?.href]);

  // Medidas do print 28 (1440 px): símbolo de ~29 × 26 px a ~18 px da borda; nome da clínica em 16 px a ~11 px do
  // símbolo; abas em 14 px com ~14 px de cada lado; "ATTA" na font-atta em 12 px (a largura e a altura das letras das
  // outras abas); o nome da pessoa em 13 px, a ~26 px da borda direita.
  return (
    <header
      className={`flex flex-wrap items-center gap-x-[1.125rem] gap-y-1 px-3 py-1.5 medium:px-6 large:h-[3.25rem] large:flex-nowrap large:items-stretch large:py-0 large:pr-[1.375rem] large:pl-2.5 ${barra}`}
    >
      {/* flex-1 com base 0: o nome não empurra o sino para outra linha no celular; ele encolhe com reticências */}
      <div className="flex min-h-14 min-w-0 flex-1 items-center gap-1 large:min-h-0 large:flex-none">
        <button
          type="button"
          onClick={() => setClara((valor) => !valor)}
          aria-pressed={clara}
          aria-label={clara ? t.barraEscura : t.barraClara}
          className="flex size-11 shrink-0 items-center justify-center rounded-md"
        >
          <Monograma className="h-[1.625rem] w-[1.875rem]" />
        </button>
        {sessao.clinica && (
          <span title={sessao.clinica} className="truncate font-title text-base">
            {sessao.clinica}
          </span>
        )}
      </div>

      {/* abaixo de large as abas ficam numa linha própria (rolável só no celular); de large em diante, entre o nome e o sino */}
      <nav ref={linhaDasAbas} aria-label={t.modulos} className="order-last w-full min-w-0 overflow-x-auto pb-1 large:order-none large:flex large:w-auto large:min-w-0 large:flex-1 large:items-end large:overflow-visible large:pb-0">
        {/* p-1: a nav rolável corta o que passa da borda; a folga deixa o anel de foco (2 px + 2 px) inteiro. Em large, as
            abas encostam embaixo da barra, como no simulador */}
        <ul className="flex items-center gap-[0.1875rem] p-1 whitespace-nowrap large:items-end large:p-0 large:pt-2.5">
          {abas.map((aba, i) => {
            const separador = aba.grupo === "gestao" && abas[i - 1]?.grupo === "operacao";
            const atual = ativa?.href === aba.href;
            const contador = contadores[aba.href];
            return (
              <li key={aba.href} className="flex items-center large:self-stretch">
                {separador && <span aria-hidden="true" className="mx-2.5 h-6 w-px self-center bg-current opacity-30" />}
                <Link
                  href={aba.href}
                  aria-current={atual ? "page" : undefined}
                  className={`flex min-h-11 items-center gap-2 rounded-md px-3.5 large:h-full large:rounded-b-none ${aba.marca ? "font-atta text-[0.75rem]" : "text-[0.875rem]"} ${atual ? abaAtivaCls : abaInativa}`}
                >
                  {aba.rotulo}
                  {contador ? (
                    <span className={`flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold ${contadorCls}`}>
                      <span className="sr-only">{t.contador(contador)}</span>
                      <span aria-hidden="true">{contador}</span>
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="ml-auto flex min-h-14 shrink-0 items-center gap-1 large:min-h-0">
        <Link href="/painel/notificacoes" aria-label={t.sino(sessao.notificacoes)} className="relative flex size-11 items-center justify-center rounded-md">
          <IconeSino />
          {sessao.notificacoes > 0 && (
            <span aria-hidden="true" className={`absolute top-1 right-0.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[0.625rem] font-semibold ${contadorCls}`}>
              {sessao.notificacoes}
            </span>
          )}
        </Link>
        <MenuDaPessoa nome={sessao.pessoa.nome} clara={clara} acaoSair={acaoSair} />
      </div>
    </header>
  );
}

// Menu da pessoa logada (PDD §10: "o menu da pessoa logada (perfil e sair)"; simulador: "Sair / trocar usuário").
// O perfil entra quando a tela existir. Botão com aria-expanded; Esc e clique fora fecham, e o foco volta ao botão.
function MenuDaPessoa({ nome, clara, acaoSair }: { nome: string; clara: boolean; acaoSair: () => Promise<void> }) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const idDoMenu = useId();

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAberto(false);
      botao.current?.focus();
    };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  return (
    <div
      ref={raiz}
      className="relative"
      onBlur={(e) => {
        // Tab para fora do menu também fecha (o foco saiu da raiz)
        if (aberto && !raiz.current?.contains(e.relatedTarget as Node | null)) setAberto(false);
      }}
    >
      <button
        ref={botao}
        type="button"
        title={nome || undefined}
        aria-label={t.menuDaPessoa(nome)}
        aria-expanded={aberto}
        aria-controls={idDoMenu}
        onClick={() => setAberto((v) => !v)}
        className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full large:pr-1"
      >
        <span aria-hidden="true" className={`flex size-8 items-center justify-center rounded-full text-xs font-semibold ${clara ? "bg-brand text-on-brand" : "bg-on-brand text-brand"}`}>
          {iniciais(nome)}
        </span>
        {/* o nome, como no simulador, a partir de large; o rótulo do botão ("Menu de …") já o contém (WCAG 2.5.3) */}
        {nome && (
          <span aria-hidden="true" className="hidden max-w-48 truncate text-[0.8125rem] font-semibold large:inline">
            {nome}
          </span>
        )}
      </button>
      <div id={idDoMenu} hidden={!aberto} className="absolute right-0 z-10 mt-2 min-w-56 rounded-md border border-border bg-surface-raised p-1 text-text-primary">
        <form action={acaoSair}>
          {/* o painel é claro mesmo com a barra escura: o anel volta ao focus-ring. O "!" vence a regra da barra escura
              ([&_:focus-visible]:outline-on-brand no header), que tem a mesma especificidade. */}
          <button type="submit" className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm hover:bg-surface-card focus-visible:outline-focus-ring!">
            {t.sair}
          </button>
        </form>
      </div>
    </div>
  );
}

function IconeSino() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16ZM10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}
