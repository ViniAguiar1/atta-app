"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { DataState } from "@/components/ui/DataState";
import type { Grupo } from "../formato";
import type { Notificacao, TipoDeNotificacao } from "../schema";
import { textos } from "../textos";

// Caixa de notificações (Simulador ATTA-in, captura 41; PDD v206 §21): a busca no título ou no corpo e as notificações
// em grupos (Hoje, Ontem, Anteriores), mais novas primeiro. O grupo e o "quando" chegam prontos do servidor, no fuso da
// clínica. A busca filtra só o que já está na tela, sem ir ao servidor. "Marcar todas como lidas" e o filtro entram com
// a gravação do MIG-15.

export type ItemDaCaixa = Pick<Notificacao, "id" | "tipo" | "evento" | "titulo" | "corpo" | "lida"> & {
  grupo: Grupo;
  quando: string;
  destino: { rotulo: string; href: string } | null;
};

const t = textos;
const ORDEM: Grupo[] = ["hoje", "ontem", "anteriores"];
const normal = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function CaixaDeNotificacoes({ itens }: { itens: ItemDaCaixa[] }) {
  const [busca, setBusca] = useState("");
  const idDaBusca = useId();
  const visiveis = useMemo(() => {
    const termo = normal(busca.trim());
    return termo ? itens.filter((n) => normal(`${n.titulo} ${n.corpo}`).includes(termo)) : itens;
  }, [itens, busca]);

  const estado = itens.length === 0 ? { tipo: "vazio" as const } : visiveis.length === 0 ? { tipo: "sem-resultado" as const, limparFiltros: () => setBusca("") } : { tipo: "pronto" as const };

  return (
    <div className="flex min-w-0 flex-col gap-3 text-[0.8125rem]">
      {itens.length > 0 && (
        <div role="search" className="flex items-center gap-2">
          <label htmlFor={idDaBusca} className="sr-only">{t.busca.rotulo}</label>
          <input
            id={idDaBusca}
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t.busca.placeholder}
            className="h-9 w-full max-w-56 rounded-full border border-border-functional bg-surface-raised px-4"
          />
        </div>
      )}
      <DataState estado={estado} rotulo={t.lista} esqueleto={{ linhas: 3, alturaRem: 6 }} vazio={t.vazio}>
        {ORDEM.map((grupo) => {
          const doGrupo = visiveis.filter((n) => n.grupo === grupo);
          if (doGrupo.length === 0) return null;
          return (
            <section key={grupo} aria-labelledby={`grupo-${grupo}`} className="flex flex-col gap-2">
              <h2 id={`grupo-${grupo}`} className="text-[0.6875rem] font-semibold tracking-wide text-status-info uppercase">
                {t.grupos[grupo]} <span className="ml-1">{doGrupo.length}</span>
              </h2>
              <ul className="flex flex-col gap-2">
                {doGrupo.map((n) => (
                  <Cartao key={n.id} n={n} />
                ))}
              </ul>
            </section>
          );
        })}
      </DataState>
    </div>
  );
}

function Cartao({ n }: { n: ItemDaCaixa }) {
  return (
    <li className={`flex gap-3 rounded-md border p-3.5 ${n.lida ? "border-border bg-surface-raised" : "border-border-functional bg-surface-card"}`}>
      <span aria-hidden="true" className={`flex size-9 shrink-0 items-center justify-center rounded-md ${n.lida ? "bg-surface-card text-text-secondary" : "bg-brand text-on-brand"}`}>
        <Icone tipo={n.tipo} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h3 className="text-[0.9375rem] font-semibold text-text-primary">{n.titulo}</h3>
          <span className="text-xs text-text-secondary">{n.quando}</span>
        </div>
        <p className="text-text-primary">{n.corpo}</p>
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-card px-2 py-0.5 text-xs font-medium">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-text-secondary" />
            {n.evento}
          </span>
          {!n.lida && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-2 py-0.5 text-xs font-medium text-on-brand">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-on-brand" />
              {t.naoLida}
            </span>
          )}
        </div>
        {n.destino && (
          <Link href={n.destino.href} className="mt-1 inline-flex min-h-11 w-fit items-center rounded-md border border-border-functional bg-surface-raised px-3 font-medium hover:bg-surface-card medium:min-h-8">
            {n.destino.rotulo}
          </Link>
        )}
      </div>
    </li>
  );
}

// Ícones de traço fino (Guia de Design §7), decorativos.
const traco = { viewBox: "0 0 24 24", className: "size-4", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", focusable: "false" } as const;
function Icone({ tipo }: { tipo: TipoDeNotificacao }) {
  if (tipo === "agenda")
    return (
      <svg {...traco}>
        <rect x="3.5" y="5" width="17" height="15" rx="2" />
        <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      </svg>
    );
  if (tipo === "documento")
    return (
      <svg {...traco}>
        <path d="M14 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8L14 3.5Z" />
        <path d="M14 3.5V8h4.5M9 13h6M9 16.5h4" />
      </svg>
    );
  if (tipo === "equipe")
    return (
      <svg {...traco}>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
      </svg>
    );
  if (tipo === "checkin")
    return (
      <svg {...traco}>
        <path d="M5 12.5 9.5 17 19 7.5" />
      </svg>
    );
  return (
    <svg {...traco}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}
