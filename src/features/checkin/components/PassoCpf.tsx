"use client";

import { useState, useTransition } from "react";
import { Botao } from "@/components/ui/Botao";
import { iniciarCheckin } from "../actions";
import { cpfValido, mascararCpf } from "../schema";
import { TEXTOS } from "../textos";
import { Titulo } from "./Titulo";

type Props = { portal: string; aoEnviar: (desafio: string, finalCelular: string) => void };

export function PassoCpf({ portal, aoEnviar }: Props) {
  const [cpf, setCpf] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!cpfValido(cpf)) return setErro(TEXTOS.cpfInvalido);
    setErro(null);
    iniciar(async () => {
      const r = await iniciarCheckin({ portal, cpf });
      if (r.ok) return aoEnviar(r.data.desafio, r.data.finalCelular);
      setErro(r.error.code === "NAO_ENCONTRADO" ? TEXTOS.semAtendimentoAntesDoCodigo : r.error.code === "VALIDACAO" ? TEXTOS.cpfInvalido : TEXTOS.indisponivel);
    });
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-6">
      <Titulo>Check-in</Titulo>
      <p>{TEXTOS.identificacao}</p>
      <div className="flex flex-col gap-2">
        <label htmlFor="cpf" className="font-medium">
          CPF
        </label>
        <input
          id="cpf"
          name="cpf"
          inputMode="numeric"
          autoComplete="off"
          placeholder="000.000.000-00"
          value={cpf}
          onChange={(e) => setCpf(mascararCpf(e.target.value))}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? "cpf-erro" : undefined}
          className="min-h-12 rounded-md border border-border-functional bg-surface-raised px-4 text-xl tracking-wide"
        />
        {erro && (
          <p id="cpf-erro" role="alert" className="text-status-negative">
            {erro}
          </p>
        )}
      </div>
      <Botao type="submit" disabled={enviando}>
        {enviando ? "Enviando…" : "Enviar código"}
      </Botao>
    </form>
  );
}
