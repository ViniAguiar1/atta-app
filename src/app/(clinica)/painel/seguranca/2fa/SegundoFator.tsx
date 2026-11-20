"use client";

import { useActionState, useState } from "react";
import type { Resultado } from "@/lib/errors";
import { sair } from "../../../login/actions";
import { type Ativacao, confirmarCodigo, iniciarAtivacao } from "./actions";

export type Passo = { tipo: "ativar" } | { tipo: "confirmar"; factorId: string } | { tipo: "ativo" };

const campo = "min-h-11 w-full rounded-md border border-border-functional bg-surface-raised px-3 text-text-primary";
const botao = "min-h-11 w-full rounded-md bg-brand px-5 font-medium text-on-brand";

// Tela funcional do 2º fator (o visual final é do Frontend). Sem supabase-js no navegador: tudo por server action.
export function SegundoFator({ passo, volta }: { passo: Passo; volta: string }) {
  const [ativacao, setAtivacao] = useState<Resultado<Ativacao> | null>(null);
  const [gerando, setGerando] = useState(false);
  const [estado, confirmar, enviando] = useActionState(confirmarCodigo, null);

  if (passo.tipo === "ativo")
    return (
      <p className="text-text-secondary">
        O autenticador está ativo nesta sessão.{" "}
        <a className="text-brand underline" href={volta}>
          Voltar
        </a>
      </p>
    );

  const factorId = passo.tipo === "confirmar" ? passo.factorId : ativacao?.ok ? ativacao.data.factorId : null;
  const erro = estado && !estado.ok ? estado.error.message : ativacao && !ativacao.ok ? ativacao.error.message : null;

  return (
    <div className="flex flex-col gap-4">
      {passo.tipo === "ativar" && !ativacao?.ok && (
        <>
          <p className="text-text-secondary">
            Para entrar como gestor, ative um app autenticador (Google Authenticator, Microsoft Authenticator ou outro).
          </p>
          <button
            type="button"
            className={botao}
            disabled={gerando}
            onClick={async () => {
              setGerando(true);
              setAtivacao(await iniciarAtivacao());
              setGerando(false);
            }}
          >
            {gerando ? "Gerando…" : "Gerar QR"}
          </button>
        </>
      )}
      {ativacao?.ok && (
        <>
          <p className="text-text-secondary">Leia o QR com o app autenticador e digite o código de 6 dígitos.</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- QR em data: gerado pelo Supabase, sem otimização */}
          <img src={ativacao.data.qr} alt="QR do app autenticador" width={192} height={192} className="self-center" />
          <p className="text-sm text-text-secondary">
            Sem câmera? Digite a chave no app:{" "}
            <code data-testid="chave-totp" className="break-all text-text-primary">
              {ativacao.data.segredo}
            </code>
          </p>
        </>
      )}
      {factorId && (
        <form action={confirmar} className="flex flex-col gap-4">
          <input type="hidden" name="factorId" value={factorId} />
          <input type="hidden" name="volta" value={volta} />
          <div className="flex flex-col gap-1">
            <label htmlFor="codigo">Código</label>
            <input id="codigo" name="codigo" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required className={campo} />
          </div>
          <button type="submit" disabled={enviando} className={botao}>
            {enviando ? "Confirmando…" : "Confirmar"}
          </button>
        </form>
      )}
      {erro && (
        <p role="alert" className="text-sm text-status-negative">
          {erro}
        </p>
      )}
      {/* "Voltar" (simulador, captura 08): quem não quer ativar agora sai da sessão e volta à tela de entrar */}
      <form action={sair}>
        <button type="submit" className="min-h-11 text-sm font-semibold text-text-primary underline underline-offset-2">
          Voltar
        </button>
      </form>
    </div>
  );
}
