"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Botao } from "@/components/ui/Botao";
import { TituloDoPasso } from "@/components/ui/TituloDoPasso";
import { confirmarPin } from "../actions";
import { TEXTOS } from "../textos";

// PIN de 4 dígitos do Boarding Check (PDD §10.2.3). A tela não conta tentativas: mostra o que o servidor devolver
// (5 erros seguidos bloqueiam por 15 min; 10 no total revogam o link; RN-FIC-07 e ADR 0004 §3). Com o PIN certo, a
// action grava a sessão e a página se recarrega no servidor, que mostra o atendimento.
export function TelaPin({ temLink }: { temLink: boolean }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [semValidade, setSemValidade] = useState(!temLink);
  const [ocupado, executar] = useTransition();
  const campo = useRef<HTMLInputElement>(null);

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!/^\d{4}$/.test(pin)) return mostrarErro(TEXTOS.senhaIncompleta);
    executar(async () => {
      const r = await confirmarPin({ pin });
      if (!r.ok) return mostrarErro(TEXTOS.indisponivel);
      if (r.data.status === "ok") return router.refresh();
      if (r.data.status === "indisponivel") return setSemValidade(true);
      mostrarErro(r.data.status === "bloqueado" ? TEXTOS.bloqueado(r.data.minutos) : TEXTOS.senhaNaoConfere);
    });
  }

  function mostrarErro(texto: string) {
    setPin("");
    setErro(texto);
    campo.current?.focus(); // volta ao campo; o erro é lido pelo aria-describedby (uma vez só)
  }

  if (semValidade) {
    return (
      <section className="flex flex-col gap-4">
        <TituloDoPasso>{TEXTOS.linkSemValidade}</TituloDoPasso>
        <p>{TEXTOS.linkSemValidadeAjuda}</p>
      </section>
    );
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-6">
      <TituloDoPasso>{TEXTOS.titulo}</TituloDoPasso>
      <p>{TEXTOS.pedirSenha}</p>
      <div className="flex flex-col gap-2">
        <label htmlFor="pin" className="font-medium">
          {TEXTOS.rotuloSenha}
        </label>
        <input
          ref={campo}
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? "pin-erro" : undefined}
          className="min-h-12 w-40 rounded-md border border-border-functional bg-surface-raised px-4 text-2xl tracking-[0.5em]"
        />
        {erro && (
          <p id="pin-erro" className="text-status-negative">
            {erro}
          </p>
        )}
      </div>
      <Botao type="submit" disabled={ocupado}>
        {ocupado ? TEXTOS.conferindo : TEXTOS.entrar}
      </Botao>
    </form>
  );
}
