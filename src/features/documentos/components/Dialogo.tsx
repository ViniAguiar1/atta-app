"use client";

import { useEffect, useId, useRef } from "react";

// Diálogo modal com o <dialog> nativo (showModal): o navegador prende o foco, Esc fecha e o fundo fica inerte. O título
// nomeia o diálogo para o leitor de tela.
type Props = { titulo: string; aoFechar: () => void; children: React.ReactNode };

export function Dialogo({ titulo, aoFechar, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const idDoTitulo = useId();
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={idDoTitulo}
      onCancel={(e) => {
        e.preventDefault();
        aoFechar();
      }}
      className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-lg border border-border bg-surface-raised p-6 text-[0.8125rem] text-text-primary backdrop:bg-text-primary/40"
    >
      <h2 id={idDoTitulo} className="mb-3 text-base font-medium">
        {titulo}
      </h2>
      {children}
    </dialog>
  );
}
