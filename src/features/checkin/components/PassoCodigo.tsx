"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Botao } from "@/components/ui/Botao";
import { confirmarCodigo, reenviarCodigo } from "../actions";
import type { Situacao } from "../schema";
import { TEXTOS } from "../textos";
import { TituloDoPasso as Titulo } from "@/components/ui/TituloDoPasso";

// 30 s entre envios (PDD §11.4). O limite de 3 reenvios a cada 15 min é do servidor (janela que reabre sozinha):
// a tela não conta reenvios e mostra o LIMITE que ele devolver (Considerações da PO v93, §25). A espera é
// calculada pelo horário do último envio, não por decremento: com a aba em segundo plano o timer atrasa.
const ESPERA_S = 30;

type Props = {
  desafio: string;
  finalCelular: string;
  aoConfirmar: (situacao: Situacao) => void;
  aoCorrigirCpf: () => void;
};

export function PassoCodigo({ desafio, finalCelular, aoConfirmar, aoCorrigirCpf }: Props) {
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviadoEm, setEnviadoEm] = useState(() => Date.now());
  const [agora, setAgora] = useState(enviadoEm);
  const campo = useRef<HTMLInputElement>(null);
  const [cancelado, setCancelado] = useState(false); // 5º erro: o código caiu e só um novo vale (PDD §11.4)
  const [ocupado, executar] = useTransition();

  const espera = Math.max(0, ESPERA_S - Math.floor((agora - enviadoEm) / 1000));

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setAgora(Date.now()), 1000);
    return () => clearTimeout(t);
  }, [espera, agora]);

  function confirmar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!/^\d{6}$/.test(codigo)) return setErro(TEXTOS.codigoNaoConfere);
    executar(async () => {
      const r = await confirmarCodigo({ desafio, codigo });
      if (r.ok) return aoConfirmar(r.data.situacao);
      setCodigo("");
      setCancelado(r.error.code === "LIMITE");
      setErro(
        r.error.code === "LIMITE"
          ? TEXTOS.codigoCancelado
          : r.error.code === "INDISPONIVEL" || r.error.code === "INTERNO"
            ? TEXTOS.indisponivel
            : TEXTOS.codigoNaoConfere,
      );
      campo.current?.focus(); // volta ao campo para digitar de novo (o erro é lido pelo aria-describedby)
    });
  }

  function reenviar() {
    executar(async () => {
      const r = await reenviarCodigo({ desafio });
      if (!r.ok) return setErro(r.error.code === "LIMITE" ? TEXTOS.naoRecebeu : TEXTOS.indisponivel);
      setErro(null);
      setCancelado(false);
      const novo = Date.now();
      setEnviadoEm(novo);
      setAgora(novo);
      setAviso(`Enviamos um novo código para o celular terminado em ${r.data.finalCelular}.`);
    });
  }

  const podeReenviar = espera <= 0 && !ocupado;

  return (
    <form onSubmit={confirmar} noValidate className="flex flex-col gap-6">
      <Titulo>Digite o código</Titulo>
      <p>Enviamos um código de 6 números por WhatsApp para o celular terminado em {finalCelular}.</p>
      <div className="flex flex-col gap-2">
        <label htmlFor="codigo" className="font-medium">
          Código
        </label>
        <input
          ref={campo}
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
      </div>
      <Botao type="submit" disabled={ocupado || cancelado}>
        {ocupado ? "Confirmando…" : "Confirmar"}
      </Botao>
      <Botao variante="secundario" onClick={reenviar} disabled={!podeReenviar}>
        {espera > 0 ? `Reenviar código em ${espera} s` : "Reenviar código"}
      </Botao>
      <p>{TEXTOS.naoRecebeu}</p>
      <button type="button" onClick={aoCorrigirCpf} className="min-h-12 self-start text-lg font-medium underline">
        Corrigir o CPF
      </button>
    </form>
  );
}
