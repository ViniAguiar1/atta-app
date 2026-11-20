"use client";

import { useActionState, useId, useState } from "react";
import { Botao } from "@/components/ui/Botao";
import { entrarComSenha } from "./actions";
import { textos as t } from "./textos";

// Formulário da tela de entrar (Simulador ATTA-in, captura 07). Os `name` (email, senha, volta) e a action são o
// contrato com o Backend 1 (MIG-03b). O erro fica acima do botão, como no simulador.
export function FormularioDeEntrada({ volta = "" }: { volta?: string }) {
  const [estado, enviar, enviando] = useActionState(entrarComSenha, null);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const idEmail = useId();
  const idSenha = useId();
  const idErro = useId();
  const erro = estado && !estado.ok ? (t.erros[estado.error.code as keyof typeof t.erros] ?? t.erros.OUTRO) : null;
  const descricao = erro ? idErro : undefined;
  const campo = "min-h-12 w-full rounded-md border border-border-functional bg-surface-raised px-4";

  return (
    <form action={enviar} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="volta" value={volta} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={idEmail} className="text-sm font-medium">
          {t.email}
        </label>
        <input id={idEmail} name="email" type="email" autoComplete="username" required aria-invalid={erro ? true : undefined} aria-describedby={descricao} className={campo} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={idSenha} className="text-sm font-medium">
          {t.senha}
        </label>
        <div className="relative">
          <input
            id={idSenha}
            name="senha"
            type={mostrarSenha ? "text" : "password"}
            autoComplete="current-password"
            required
            aria-invalid={erro ? true : undefined}
            aria-describedby={descricao}
            className={`${campo} pr-24`}
          />
          <button
            type="button"
            onClick={() => setMostrarSenha((v) => !v)}
            aria-pressed={mostrarSenha}
            aria-controls={idSenha}
            className="absolute inset-y-0 right-1 my-auto flex min-h-11 items-center rounded-md px-3 text-sm font-semibold"
          >
            {mostrarSenha ? t.ocultar : t.mostrar}
          </button>
        </div>
      </div>
      {erro && (
        <p id={idErro} role="alert" className="text-status-negative">
          {erro}
        </p>
      )}
      <Botao type="submit" disabled={enviando}>
        {enviando ? t.entrando : t.entrar}
      </Botao>
    </form>
  );
}
