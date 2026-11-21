"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { textos } from "../textos";

// Campo do Código ATTA (simulador, captura 53). Vai para /verificar/<código>, como verify.attahub.com.br/<código>: o
// código não é dado pessoal. Quem normaliza (minúscula, espaço, sem hífen) é o servidor (normalizeAttaCode).
export function FormularioDoCodigo({ inicial = "" }: { inicial?: string }) {
  const router = useRouter();
  const [codigo, setCodigo] = useState(inicial);
  const [ocupado, executar] = useTransition();

  function verificar(evento: React.FormEvent) {
    evento.preventDefault();
    const limpo = codigo.trim();
    if (!limpo) return;
    executar(() => router.push(`/verificar/${encodeURIComponent(limpo)}`));
  }

  return (
    <form onSubmit={verificar} className="flex flex-col gap-2">
      <label htmlFor="codigo-atta" className="text-corpo font-medium text-text-primary">
        {textos.rotuloCodigo}
      </label>
      <div className="flex flex-col gap-3 medium:flex-row">
        <input
          id="codigo-atta"
          name="codigo"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          placeholder={textos.placeholder}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="min-h-11.5 flex-1 rounded-sm border-[1.5px] border-text-primary bg-surface-raised px-3 font-codigo text-base"
        />
        <button type="submit" disabled={ocupado} className="min-h-11.5 rounded-sm bg-brand px-4 text-sm font-semibold text-on-brand shadow-md disabled:opacity-60">
          {ocupado ? textos.verificando : textos.verificar}
        </button>
      </div>
    </form>
  );
}
