"use client";

import { useEffect, useState, useTransition } from "react";
import { Botao } from "@/components/ui/Botao";
import { confirmarCodigo, reenviarCodigo } from "../actions";
import type { Situacao } from "../schema";
import { TEXTOS } from "../textos";
import { Titulo } from "./Titulo";

// 30 s entre envios e até 3 reenvios (PDD §11.4). A tela só espelha: quem garante o limite é o servidor.
const ESPERA_S = 30;
const MAX_REENVIOS = 3;

type Props = {
  desafio: string;
  finalCelular: string;
  dica?: string;
  aoConfirmar: (situacao: Situacao) => void;
  aoCorrigirCpf: () => void;
};

export function PassoCodigo({ desafio, finalCelular, dica, aoConfirmar, aoCorrigirCpf }: Props) {
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [espera, setEspera] = useState(ESPERA_S);
  const [reenvios, setReenvios] = useState(0);
  const [ocupado, executar] = useTransition();

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  function confirmar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!/^\d{6}$/.test(codigo)) return setErro(TEXTOS.codigoNaoConfere);
    executar(async () => {
      const r = await confirmarCodigo({ desafio, codigo });
      if (r.ok) return aoConfirmar(r.data.situacao);
      setCodigo("");
      setErro(r.error.code === "INDISPONIVEL" || r.error.code === "INTERNO" ? TEXTOS.indisponivel : TEXTOS.codigoNaoConfere);
    });
  }

  function reenviar() {
    executar(async () => {
      const r = await reenviarCodigo({ desafio });
      setErro(r.ok ? null : TEXTOS.codigoNaoConfere);
      if (!r.ok) return;
      setReenvios((n) => n + 1);
      setEspera(ESPERA_S);
      setAviso(`Enviamos um novo código para o celular terminado em ${r.data.finalCelular}.`);
    });
  }

  const podeReenviar = espera <= 0 && reenvios < MAX_REENVIOS && !ocupado;

  return (
    <form onSubmit={confirmar} noValidate className="flex flex-col gap-6">
      <Titulo>Digite o código</Titulo>
      <p>Enviamos um código de 6 números por WhatsApp para o celular terminado em {finalCelular}.</p>
      <div className="flex flex-col gap-2">
        <label htmlFor="codigo" className="font-medium">
          Código
        </label>
        <input
          id="codigo"
          name="codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? "codigo-erro" : undefined}
          className="min-h-12 rounded-md border border-border-functional bg-surface-raised px-4 text-2xl tracking-widest"
        />
        {erro && (
          <p id="codigo-erro" role="alert" className="text-status-negative">
            {erro}
          </p>
        )}
        <p aria-live="polite" className="text-text-secondary">
          {aviso}
        </p>
        {dica && <p className="text-text-secondary">{dica}</p>}
      </div>
      <Botao type="submit" disabled={ocupado}>
        {ocupado ? "Confirmando…" : "Confirmar"}
      </Botao>
      <Botao variante="secundario" onClick={reenviar} disabled={!podeReenviar}>
        {espera > 0 && reenvios < MAX_REENVIOS ? `Reenviar código em ${espera} s` : "Reenviar código"}
      </Botao>
      <p>{TEXTOS.naoRecebeu}</p>
      <button type="button" onClick={aoCorrigirCpf} className="min-h-12 self-start text-lg font-medium underline">
        Corrigir o CPF
      </button>
    </form>
  );
}
