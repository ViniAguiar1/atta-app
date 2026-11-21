"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Acao } from "@/lib/agenda/linha";
import { textosDaAgenda as textos } from "./textos";

// Menu ⋮ das ações de um atendimento (PDD v206 §10.2.2, "Ações por estado"; simulador, captura 32). Componente de
// domínio comum à Agenda e à Pasta (decisão do Tech Lead Frontend). Quais ações aparecem e o motivo de uma estar
// desabilitada vêm do banco (allowed_actions / disabled_reason): o menu só desenha. Padrão disclosure: o botão tem
// aria-expanded e aria-controls; Esc, clique fora e o Tab que sai fecham; o foco volta ao ⋮. Cancelar fica por último,
// separado e em vinho, como na captura. Dono: Frontend 4.

export type ItemDoMenu = { acao: Acao; desabilitadaPor?: string };

type Props = {
  itens: readonly ItemDoMenu[];
  /** quem é o atendimento, para o nome do botão ("Ações de Mariana Costa Albuquerque") */
  paciente: string;
  aoEscolher: (acao: Acao) => void;
  /** enquanto uma ação grava, o ⋮ fica ocupado */
  ocupado?: boolean;
};

const motivo = (codigo: string) => textos.desabilitada[codigo] ?? textos.desabilitada.padrao;

export function MenuDeAcoes({ itens, paciente, aoEscolher, ocupado = false }: Props) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const idDoMenu = useId();

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  if (itens.length === 0) return null;
  const comuns = itens.filter((i) => i.acao !== "cancelar");
  const cancelar = itens.find((i) => i.acao === "cancelar");

  const fechar = (voltarFoco: boolean) => {
    setAberto(false);
    if (voltarFoco) botao.current?.focus();
  };
  const escolher = (item: ItemDoMenu) => {
    if (item.desabilitadaPor) return;
    fechar(true);
    aoEscolher(item.acao);
  };

  return (
    <div
      ref={caixa}
      className="relative inline-block"
      onKeyDown={(e) => {
        if (e.key === "Escape" && aberto) {
          e.stopPropagation();
          fechar(true);
        }
      }}
      onBlur={(e) => {
        if (aberto && !e.currentTarget.contains(e.relatedTarget as Node | null)) setAberto(false);
      }}
    >
      <button
        ref={botao}
        type="button"
        aria-label={textos.menu.abrir(paciente)}
        aria-expanded={aberto}
        aria-controls={idDoMenu}
        aria-busy={ocupado || undefined}
        disabled={ocupado}
        onClick={() => setAberto((a) => !a)}
        className="flex size-11 items-center justify-center rounded-md border border-transparent medium:size-9 text-text-secondary hover:border-border-functional aria-expanded:border-border-functional"
      >
        <IconeMais />
      </button>
      {aberto && (
        <div
          id={idDoMenu}
          className="absolute top-full right-0 z-10 mt-1 w-64 rounded-md border border-border bg-surface-raised py-2 shadow-lg"
        >
          <ul className="flex flex-col">
            {comuns.map((item) => (
              <ItemDaLista key={item.acao} item={item} aoEscolher={escolher} />
            ))}
          </ul>
          {cancelar && (
            <>
              <hr className="my-2 border-border" />
              <ul>
                <ItemDaLista item={cancelar} aoEscolher={escolher} negativo />
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ItemDaLista({
  item,
  aoEscolher,
  negativo = false,
}: {
  item: ItemDoMenu;
  aoEscolher: (item: ItemDoMenu) => void;
  negativo?: boolean;
}) {
  const idDoMotivo = useId();
  const desabilitada = Boolean(item.desabilitadaPor);
  return (
    <li>
      <button
        type="button"
        aria-disabled={desabilitada || undefined}
        aria-describedby={desabilitada ? idDoMotivo : undefined}
        onClick={() => aoEscolher(item)}
        className={`flex min-h-11 w-full items-center px-4 text-left text-corpo medium:min-h-9 ${
          desabilitada
            ? "cursor-not-allowed text-text-tertiary"
            : negativo
              ? "text-status-negative hover:bg-status-negative/10"
              : "text-text-primary hover:bg-surface-card"
        }`}
      >
        {textos.acoes[item.acao]}
      </button>
      {desabilitada && (
        <span id={idDoMotivo} className="sr-only">
          {motivo(item.desabilitadaPor ?? "")}
        </span>
      )}
    </li>
  );
}

// Ícone ⋮ de traço fino (Guia de Design §7), decorativo.
function IconeMais() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true" focusable="false">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}
