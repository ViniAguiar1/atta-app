import type { ReactNode } from "react";
import { textos } from "../textos";
import { FormularioDoCodigo } from "./FormularioDoCodigo";

// Moldura da página pública (simulador, capturas 53 a 55): sobretítulo, título, subtítulo e o cartão com o campo do
// código e o resultado. Sem a moldura de navegador, a linha de códigos de demonstração e o cartão da ADR (CTO).
export function PaginaDeVerificacao({ codigo, children }: { codigo?: string; children?: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-200 flex-col gap-5 px-5 pt-6 pb-8">
      <header className="flex flex-col gap-1">
        <p className="text-rotulo font-semibold tracking-[0.14em] text-text-secondary uppercase">{textos.sobretitulo}</p>
        <h1 className="max-w-100 font-title text-manchete text-text-primary">{textos.titulo}</h1>
        <p className="text-base leading-snug text-text-secondary">{textos.subtitulo}</p>
      </header>
      <main className="flex flex-col gap-5 rounded-lg border border-border bg-surface-raised p-6">
        <FormularioDoCodigo inicial={codigo} />
        {children}
      </main>
    </div>
  );
}
