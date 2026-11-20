"use client";

import { useId, useState, useTransition } from "react";
import type { Parametro } from "@/server/configuracoes/porta";
import { salvarParametro } from "../actions";
import { textos as t } from "../textos";

// Parâmetro de liga e desliga, como no simulador: a caixa com o rótulo e, embaixo, o que muda quando está ligada. Grava
// ao marcar ou desmarcar; se o servidor recusar, a caixa volta ao valor salvo e o motivo aparece embaixo.
type Props = { parametro: Extract<Parametro, { tipo: "bool" }>; rotulo: string; ajuda: string; aoSalvar: (p: Parametro) => void };

export function CaixaDeParametro({ parametro, rotulo, ajuda, aoSalvar }: Props) {
  const id = useId();
  const [marcado, setMarcado] = useState(parametro.valor);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [salvando, executar] = useTransition();

  function mudar(valor: boolean) {
    setMarcado(valor);
    setSalvo(false);
    executar(async () => {
      const r = await salvarParametro({ chave: parametro.chave, valor });
      if (!r.ok) {
        setMarcado(parametro.valor);
        return setErro(r.error.code === "SEM_PERMISSAO" ? t.erros.SEM_PERMISSAO : t.erros.outro);
      }
      setErro(null);
      setSalvo(true);
      aoSalvar(r.data);
    });
  }

  return (
    <div>
      <div className="flex items-start gap-3 rounded-md border border-border-functional bg-surface-card p-3">
        <input
          id={id}
          type="checkbox"
          checked={marcado}
          disabled={salvando}
          onChange={(e) => mudar(e.target.checked)}
          aria-describedby={`${id}-ajuda ${id}-situacao`}
          className="mt-0.5 size-5 shrink-0 accent-brand"
        />
        <div>
          <label htmlFor={id} className="font-semibold">
            {rotulo}
          </label>
          <p id={`${id}-ajuda`} className="text-xs text-text-secondary">
            {ajuda}
          </p>
        </div>
      </div>
      <p id={`${id}-situacao`} aria-live="polite" className={erro ? "mt-1 text-status-negative" : "mt-1 text-xs text-text-secondary"}>
        {erro ?? (salvando ? t.salvando : salvo ? t.salvo : "")}
      </p>
    </div>
  );
}
