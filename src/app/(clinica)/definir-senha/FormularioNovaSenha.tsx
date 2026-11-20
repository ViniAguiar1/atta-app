"use client";

import { useActionState, useId } from "react";
import { definirSenha } from "./actions";

const MENSAGENS: Record<string, string> = {
  senha: "Use 12 ou mais caracteres, com letras e números.",
  confirmacao: "As duas senhas não são iguais.",
};

// Formulário funcional da nova senha (o visual final é do Frontend).
export function FormularioNovaSenha() {
  const [estado, enviar, enviando] = useActionState(definirSenha, null);
  const idSenha = useId();
  const idConfirmacao = useId();
  const campo = estado && !estado.ok ? estado.error.fields?.[0]?.campo : undefined;
  const erro = estado && !estado.ok ? (campo ? (MENSAGENS[campo] ?? estado.error.message) : estado.error.message) : null;
  const classe = "min-h-12 w-full rounded-md border border-border-functional bg-surface-raised px-4";
  return (
    <form action={enviar} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={idSenha} className="text-sm font-medium">
          Nova senha
        </label>
        <input id={idSenha} name="senha" type="password" autoComplete="new-password" required className={classe} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={idConfirmacao} className="text-sm font-medium">
          Repita a nova senha
        </label>
        <input id={idConfirmacao} name="confirmacao" type="password" autoComplete="new-password" required className={classe} />
      </div>
      {erro && (
        <p role="alert" className="text-status-negative">
          {erro}
        </p>
      )}
      <button type="submit" disabled={enviando} className="min-h-12 w-full rounded-md bg-brand px-5 font-medium text-on-brand">
        Salvar senha
      </button>
    </form>
  );
}
