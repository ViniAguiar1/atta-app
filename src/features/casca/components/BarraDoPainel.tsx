"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { iniciais } from "@/lib/texto/iniciais";
import { textos as t } from "../textos";
import type { SessaoDoPainel } from "../sessao";
import { abaAtiva, abasDoPapel } from "../abas";

// Barra de módulos do painel (Guia de Design §4.1 e o Simulador ATTA-in). Escura por padrão; o monograma alterna para a
// clara, a cada clique, por mouse, toque ou teclado, com rótulo que diz a próxima ação. Lembrar a escolha entre
// sessões não está definido (Guia §4.1), então ela vale só enquanto a página está aberta.
// Cores: o Guia v21 pede #2c3128 na barra e #6c7563 na aba ativa, que ainda não estão nos tokens (pedido com o CTO);
// até lá a barra usa o token de marca e a aba ativa um tom do texto sobre a marca.
export function BarraDoPainel({ sessao, contadores = {} }: { sessao: SessaoDoPainel; contadores?: Record<string, number> }) {
  const [clara, setClara] = useState(false);
  const caminho = usePathname();
  const ativa = abaAtiva(caminho);
  const abas = abasDoPapel(sessao.papel);

  const barra = clara ? "border border-brand/30 bg-surface-app text-brand" : "bg-brand text-on-brand";
  const abaAtivaCls = clara ? "bg-brand/5 underline decoration-brand/45 underline-offset-8" : "bg-on-brand/15 font-semibold";
  const abaInativa = clara ? "text-brand hover:bg-brand/5" : "text-on-brand/80 hover:bg-on-brand/10 hover:text-on-brand";

  return (
    <header className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-t-md px-3 py-1.5 ${barra}`}>
      <div className="flex min-h-14 items-center gap-3">
        <button
          type="button"
          onClick={() => setClara((valor) => !valor)}
          aria-pressed={clara}
          aria-label={clara ? t.barraEscura : t.barraClara}
          className="flex size-11 items-center justify-center rounded-md"
        >
          <Monograma />
        </button>
        <span className="font-title text-lg whitespace-nowrap">{sessao.clinica}</span>
      </div>

      {/* no celular as abas ficam numa linha própria, rolável; no painel (expanded), entre o nome e o sino */}
      <nav aria-label={t.modulos} className="order-last w-full min-w-0 overflow-x-auto pb-1 expanded:order-none expanded:w-auto expanded:flex-1 expanded:pb-0">
        <ul className="flex items-center gap-1 whitespace-nowrap">
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
                  className={`flex min-h-11 items-center gap-2 rounded-md px-3 text-sm ${atual ? abaAtivaCls : abaInativa}`}
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

      <div className="ml-auto flex min-h-14 items-center gap-3 expanded:ml-0">
        <Link href="/painel/notificacoes" aria-label={t.sino(sessao.notificacoes)} className="relative flex size-11 items-center justify-center rounded-md">
          <IconeSino />
          {sessao.notificacoes > 0 && (
            <span aria-hidden="true" className="absolute top-1 right-1 rounded-full bg-on-brand px-1.5 text-xs text-brand">
              {sessao.notificacoes}
            </span>
          )}
        </Link>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className={`flex size-9 items-center justify-center rounded-full text-xs ${clara ? "bg-brand text-on-brand" : "bg-on-brand text-brand"}`}>
            {iniciais(sessao.pessoa.nome)}
          </span>
          <span>{sessao.pessoa.nome}</span>
        </div>
      </div>
    </header>
  );
}

// Monograma de traço (o A que acolhe e o T que estrutura, Guia §7); o arquivo oficial do logo entra quando o dono
// mandar a pasta de identidade para o repo.
function Monograma() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M4 20 11 4l3 7M9 13h10M14.5 13v7" />
    </svg>
  );
}

function IconeSino() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16ZM10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}
