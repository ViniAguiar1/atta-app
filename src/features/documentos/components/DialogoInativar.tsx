"use client";

import { useState, useTransition } from "react";
import { textos } from "../textos";
import { Dialogo } from "./Dialogo";

// Confirmação antes de inativar (PDD §10.3.1): o modelo deixa de valer para novos documentos e não volta a Ativo.
type Props = { titulo: string; aoConfirmar: () => Promise<string | null>; aoFechar: () => void };

const botao = "min-h-11 rounded-md px-5 py-2.5 font-medium";

export function DialogoInativar({ titulo, aoConfirmar, aoFechar }: Props) {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, executar] = useTransition();
  return (
    <Dialogo titulo={textos.inativar.titulo(titulo)} aoFechar={aoFechar}>
      <p>{textos.inativar.texto}</p>
      {erro && (
        <p role="alert" className="mt-3 text-status-negative">
          {erro}
        </p>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <button type="button" onClick={aoFechar} disabled={ocupado} className={`${botao} border border-border-functional`}>
          {textos.cancelar}
        </button>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => executar(async () => setErro(await aoConfirmar()))}
          className={`${botao} bg-brand text-on-brand`}
        >
          {ocupado ? textos.salvando : textos.inativar.confirmar}
        </button>
      </div>
    </Dialogo>
  );
}
