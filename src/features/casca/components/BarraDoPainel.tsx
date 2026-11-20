"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Monograma } from "@/components/ui/Monograma";
import { iniciais } from "@/lib/texto/iniciais";
import { textos as t } from "../textos";
import type { SessaoDoPainel } from "../sessao";
import { abaAtiva, abasDoPapel, MODULOS_PRONTOS } from "../abas";

// Barra de módulos do painel (Guia de Design §4.1 e o Simulador ATTA-in). Escura por padrão; o monograma alterna para a
// clara, a cada clique, por mouse, toque ou teclado, com rótulo que diz a próxima ação. Lembrar a escolha entre
// sessões não está definido (Guia §4.1), então ela vale só enquanto a página está aberta.
// Foco: na barra escura o anel global (cor da marca) some no fundo da marca, então ali ele vira o claro (on-brand).
// Largura: abaixo de large as abas descem para uma linha própria; de large em diante ficam na linha da barra sem
// encolher, e quem cede espaço é o nome da clínica (reticências). A pessoa aparece pelas iniciais; o nome vai ao leitor.
// Cores do Guia v21 §4.1: barra em brand (#2c3128); aba ativa em brand-active (#6c7563), texto branco 600; inativas em
// branco a 78 %. Clara: fundo off-white, escrita em brand, borda de 1 px a 32 % (só embaixo: a barra vai de ponta a ponta),
// aba ativa a 5 % com sublinhado de 1 px a 45 %.
type Props = {
  sessao: SessaoDoPainel;
  /** Server action que encerra a sessão (login/actions.ts); vem do layout, para a feature não importar rota. */
  acaoSair: () => Promise<void>;
  contadores?: Record<string, number>;
  prontos?: readonly string[];
};

export function BarraDoPainel({ sessao, acaoSair, contadores = {}, prontos = MODULOS_PRONTOS }: Props) {
  const [clara, setClara] = useState(false);
  const caminho = usePathname();
  const ativa = abaAtiva(caminho);
  const abas = abasDoPapel(sessao.papel, prontos);
  const comSino = prontos.includes("/painel/notificacoes"); // o sino entra com o MIG-45

  const barra = clara ? "border-b border-brand/32 bg-surface-app text-brand" : "bg-brand text-on-brand [&_:focus-visible]:outline-on-brand";
  const abaAtivaCls = clara ? "bg-brand/5 underline decoration-brand/45 decoration-1 underline-offset-8" : "bg-brand-active font-semibold text-on-brand";
  const abaInativa = clara ? "text-brand hover:bg-brand/5" : "text-on-brand/78 hover:bg-on-brand/10 hover:text-on-brand";

  return (
    <header className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 large:flex-nowrap medium:px-6 ${barra}`}>
      {/* flex-1 com base 0: o nome não empurra o sino para outra linha no celular; ele encolhe com reticências */}
      <div className="flex min-h-14 min-w-0 flex-1 items-center gap-3">
        <button
          type="button"
          onClick={() => setClara((valor) => !valor)}
          aria-pressed={clara}
          aria-label={clara ? t.barraEscura : t.barraClara}
          className="flex size-11 shrink-0 items-center justify-center rounded-md"
        >
          <Monograma />
        </button>
        {sessao.clinica && (
          <span title={sessao.clinica} className="truncate font-title text-lg">
            {sessao.clinica}
          </span>
        )}
      </div>

      {/* abaixo de large as abas ficam numa linha própria (rolável só no celular); de large em diante, entre o nome e o sino */}
      <nav aria-label={t.modulos} className="order-last w-full min-w-0 overflow-x-auto pb-1 large:order-none large:w-auto large:flex-none large:overflow-visible large:pb-0">
        {/* p-1: a nav rolável corta o que passa da borda; a folga deixa o anel de foco (2 px + 2 px) inteiro */}
        <ul className="flex items-center gap-1 p-1 whitespace-nowrap">
          {abas.map((aba, i) => {
            const separador = aba.grupo === "gestao" && abas[i - 1]?.grupo === "operacao";
            const atual = ativa?.href === aba.href;
            const contador = contadores[aba.href];
            return (
              <li key={aba.href} className="flex items-center">
                {separador && <span aria-hidden="true" className="mx-2 h-6 w-px bg-current opacity-30" />}
                <Link
                  href={aba.href}
                  aria-current={atual ? "page" : undefined}
                  className={`flex min-h-11 items-center gap-2 rounded-md px-3 text-sm ${aba.marca ? "font-atta" : ""} ${atual ? abaAtivaCls : abaInativa}`}
                >
                  {aba.rotulo}
                  {contador ? (
                    <span className={`rounded-full px-2 text-xs ${clara ? "bg-brand text-on-brand" : "bg-on-brand text-brand"}`}>
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

      <div className="ml-auto flex min-h-14 shrink-0 items-center gap-3">
        {comSino && (
          <Link href="/painel/notificacoes" aria-label={t.sino(sessao.notificacoes)} className="relative flex size-11 items-center justify-center rounded-md">
            <IconeSino />
            {sessao.notificacoes > 0 && (
              <span aria-hidden="true" className="absolute top-1 right-1 rounded-full bg-on-brand px-1.5 text-xs text-brand">
                {sessao.notificacoes}
              </span>
            )}
          </Link>
        )}
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
        className="flex size-11 items-center justify-center rounded-full"
      >
        <span aria-hidden="true" className={`flex size-9 items-center justify-center rounded-full text-xs ${clara ? "bg-brand text-on-brand" : "bg-on-brand text-brand"}`}>
          {iniciais(nome)}
        </span>
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
