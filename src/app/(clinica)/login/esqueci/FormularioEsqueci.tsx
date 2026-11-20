"use client";

import { useActionState, useId } from "react";
import { pedirNovaSenha } from "./actions";

// Formulário funcional do "Esqueci a senha" (textos do simulador; o visual final é do Frontend).
export function FormularioEsqueci() {
  const [estado, enviar, enviando] = useActionState(pedirNovaSenha, null);
  const id = useId();
  if (estado?.ok)
    return <p role="status">Se este e-mail tiver acesso a uma clínica ATTA, ele recebe um link para criar nova senha.</p>;
  return (
    <form action={enviar} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-sm font-medium">
          E-mail de acesso
        </label>
        <input id={id} name="email" type="email" autoComplete="username" required className="min-h-12 w-full rounded-md border border-border-functional bg-surface-raised px-4" />
      </div>
      {estado && !estado.ok && (
        <p role="alert" className="text-status-negative">
          Informe um e-mail válido.
        </p>
      )}
      <button type="submit" disabled={enviando} className="min-h-12 w-full rounded-md bg-brand px-5 font-medium text-on-brand">
        Enviar link
      </button>
    </form>
  );
}
