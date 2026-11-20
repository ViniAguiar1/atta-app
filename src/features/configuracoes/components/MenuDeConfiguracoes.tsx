"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { type Grupo, urlDaSecao } from "../secoes";
import { textos as t } from "../textos";

// Menu lateral em grupos (PDD v206 §10.4; Simulador ATTA-in, captura 02): título do grupo em caixa alta e a seção atual
// com fundo de card. Abaixo de expanded (840 px) vira um botão que abre a lista; escolher uma seção fecha. Recebe só os
// grupos disponíveis, calculados no servidor (o ambiente não existe no navegador).
export function MenuDeConfiguracoes({ grupos }: { grupos: Grupo[] }) {
  const [aberto, setAberto] = useState(false);
  const atual = usePathname();

  return (
    <nav aria-label={t.menu.rotulo} className="shrink-0 expanded:sticky expanded:top-6 expanded:w-56 expanded:self-start">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls="secoes-de-configuracoes"
        onClick={() => setAberto((v) => !v)}
        className="min-h-11 w-full rounded-md border border-border-functional bg-surface-raised px-4 text-left expanded:hidden"
      >
        {aberto ? t.menu.fechar : t.menu.abrir}
      </button>
      <div
        id="secoes-de-configuracoes"
        className={`${aberto ? "flex" : "hidden"} mt-2 flex-col gap-4 rounded-md border border-border bg-surface-raised p-3 expanded:mt-0 expanded:flex expanded:rounded-none expanded:border-0 expanded:border-r expanded:bg-transparent expanded:py-0 expanded:pr-4 expanded:pl-0`}
      >
        {grupos.map((grupo, i) => (
          <div key={grupo.titulo}>
            <h2 id={`grupo-de-secoes-${i}`} className="px-3 text-xs tracking-wide text-text-secondary uppercase">
              {grupo.titulo}
            </h2>
            <ul aria-labelledby={`grupo-de-secoes-${i}`} className="mt-1 flex flex-col">
              {grupo.secoes.map((secao) => {
                const url = urlDaSecao(secao.caminho);
                const corrente = atual === url || atual.startsWith(`${url}/`);
                return (
                  <li key={secao.caminho}>
                    <Link
                      href={url}
                      aria-current={corrente ? "page" : undefined}
                      onClick={() => setAberto(false)}
                      className={`flex min-h-11 items-center rounded-md px-3 text-text-primary ${corrente ? "bg-surface-card" : "hover:bg-surface-card"}`}
                    >
                      {secao.titulo}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
