"use client";

import { useId, useState } from "react";
import { Botao } from "@/components/ui/Botao";
import { TituloDoPasso } from "@/components/ui/TituloDoPasso";
import type { AvisoDePrivacidade } from "../aviso-de-privacidade";
import { TEXTOS } from "../textos";

// Aviso de Privacidade do Profissional (PDD v206 §10.4.3; decisão da PO): antes do Termo, com a confirmação de leitura.
// Só aparece com a trava ligada (aviso-de-privacidade.ts, P2b). A versão confirmada vai no envio final e o servidor
// confere que é a vigente; o banco grava a versão e o momento da ciência.
type Props = {
  aviso: AvisoDePrivacidade;
  ocupado: boolean;
  /** Falha ao abrir o Termo depois do aviso (o mesmo aviso genérico do passo 2). */
  erro: string | null;
  aoVoltar: () => void;
  aoContinuar: (versao: string) => void;
};

export function PassoAviso({ aviso, ocupado, erro, aoVoltar, aoContinuar }: Props) {
  const id = useId();
  const [li, setLi] = useState(false);
  const [falta, setFalta] = useState(false);

  function continuar() {
    if (!li) return setFalta(true);
    aoContinuar(aviso.versao);
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-base font-medium uppercase tracking-wide text-text-secondary">{TEXTOS.passoAviso}</p>
        <TituloDoPasso>{aviso.titulo}</TituloDoPasso>
      </div>
      <div
        role="region"
        aria-label={TEXTOS.avisoRotulo}
        tabIndex={0}
        className="flex max-h-80 flex-col gap-3 overflow-y-auto rounded-md border border-border bg-surface-raised p-4 text-base"
      >
        {aviso.paragrafos.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <label htmlFor={`${id}-li`} className="flex items-start gap-3">
        <input
          id={`${id}-li`}
          type="checkbox"
          checked={li}
          aria-describedby={falta && !li ? `${id}-falta` : undefined}
          onChange={(e) => {
            setLi(e.target.checked);
            if (e.target.checked) setFalta(false);
          }}
          className="mt-1 size-6 accent-brand"
        />
        <span>{TEXTOS.avisoConfirmo}</span>
      </label>
      {falta && !li && (
        <p id={`${id}-falta`} role="alert" className="text-status-negative">
          {TEXTOS.avisoFalta}
        </p>
      )}
      {erro && (
        <p role="alert" className="text-status-negative">
          {erro}
        </p>
      )}
      <Botao onClick={continuar} disabled={ocupado}>
        {ocupado ? TEXTOS.carregando : TEXTOS.continuar}
      </Botao>
      <Botao variante="secundario" onClick={aoVoltar} disabled={ocupado}>
        {TEXTOS.voltar}
      </Botao>
    </section>
  );
}
