"use client";

import { useRef, useState, useTransition } from "react";
import { Botao } from "@/components/ui/Botao";
import { TituloDoPasso } from "@/components/ui/TituloDoPasso";
import { pinObvio } from "../schema";
import { TEXTOS } from "../textos";

// Senha de 4 números do Boarding Check (decisão do dono, R10: o profissional cria uma vez no PROpass e usa em todo
// Boarding Check; não existe no simulador). Recusa senha óbvia (CTO, R12), aqui e no servidor. A senha só vai no corpo
// do envio final; o servidor a transforma em pin_mac antes do banco.
type Props = { aoVoltar: () => void; aoConcluir: (pin: string) => Promise<string | null> };

export function PassoSenha({ aoVoltar, aoConcluir }: Props) {
  const [pin, setPin] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<{ campo: "pin" | "confirmacao" | null; texto: string } | null>(null);
  const [ocupado, executar] = useTransition();
  const campoPin = useRef<HTMLInputElement>(null);
  const campoConfirmacao = useRef<HTMLInputElement>(null);

  function concluir(evento: React.FormEvent) {
    evento.preventDefault();
    if (!/^\d{4}$/.test(pin)) return mostrar("pin", TEXTOS.senhaFormato);
    if (pinObvio(pin)) return mostrar("pin", TEXTOS.senhaObvia);
    if (confirmacao !== pin) return mostrar("confirmacao", TEXTOS.senhaDiferente);
    setErro(null);
    executar(async () => {
      const falhou = await aoConcluir(pin);
      if (falhou) setErro({ campo: null, texto: falhou });
    });
  }

  function mostrar(campo: "pin" | "confirmacao", texto: string) {
    setErro({ campo, texto });
    (campo === "pin" ? campoPin : campoConfirmacao).current?.focus();
  }

  const campo = (id: "pin" | "confirmacao", rotulo: string, valor: string, mudar: (v: string) => void, ref: React.RefObject<HTMLInputElement | null>) => (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-medium">
        {rotulo}
      </label>
      <input
        ref={ref}
        id={id}
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        maxLength={4}
        value={valor}
        onChange={(e) => mudar(e.target.value.replace(/\D/g, "").slice(0, 4))}
        aria-invalid={erro?.campo === id || undefined}
        aria-describedby={erro?.campo === id ? `${id}-erro` : undefined}
        className="min-h-12 w-40 rounded-md border border-border-functional bg-surface-raised px-4 text-2xl tracking-[0.5em]"
      />
      {erro?.campo === id && (
        <p id={`${id}-erro`} className="text-status-negative">
          {erro.texto}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={concluir} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-base font-medium uppercase tracking-wide text-text-secondary">{TEXTOS.passoSenha}</p>
        <TituloDoPasso>{TEXTOS.senhaTitulo}</TituloDoPasso>
        <p>{TEXTOS.senhaTexto}</p>
      </div>
      {campo("pin", TEXTOS.rotuloSenha, pin, setPin, campoPin)}
      {campo("confirmacao", TEXTOS.rotuloConfirmar, confirmacao, setConfirmacao, campoConfirmacao)}
      {erro?.campo === null && (
        <p role="alert" className="text-status-negative">
          {erro.texto}
        </p>
      )}
      <Botao type="submit" disabled={ocupado}>
        {ocupado ? TEXTOS.enviando : TEXTOS.concluir}
      </Botao>
      <Botao variante="secundario" onClick={aoVoltar} disabled={ocupado}>
        {TEXTOS.voltar}
      </Botao>
    </form>
  );
}
