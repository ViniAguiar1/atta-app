"use client";

import { useState } from "react";
import type { Situacao } from "../schema";
import { PassoCodigo } from "./PassoCodigo";
import { PassoCpf } from "./PassoCpf";
import { TelaResultado } from "./TelaResultado";

// Check-in pelo celular, do QR da placa ao código (MIG-50; PDD §11.3 Caminho B e §11.4). O CPF só vive no campo:
// depois do envio, a tela guarda o desafio (uuid opaco) e o final do celular.
type Passo =
  | { nome: "cpf" }
  | { nome: "codigo"; desafio: string; finalCelular: string }
  | { nome: "resultado"; situacao: Situacao };

type Props = { portal: string; clinica: string; dica?: string };

export function FluxoCheckin({ portal, clinica, dica }: Props) {
  const [passo, setPasso] = useState<Passo>({ nome: "cpf" });

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-8 px-5 py-6 text-lg">
      <header className="flex items-baseline justify-between gap-4">
        {/* "ATTA" em Allerta Stencil e "-in" em Montserrat (Guia de Design §2.1) */}
        <span className="text-2xl text-brand">
          <span className="font-atta">ATTA</span>
          <span className="font-product">-in</span>
        </span>
        <span className="text-right text-base text-text-secondary">{clinica}</span>
      </header>
      <main>
        {passo.nome === "cpf" && (
          <PassoCpf portal={portal} aoEnviar={(desafio, finalCelular) => setPasso({ nome: "codigo", desafio, finalCelular })} />
        )}
        {passo.nome === "codigo" && (
          <PassoCodigo
            desafio={passo.desafio}
            finalCelular={passo.finalCelular}
            dica={dica}
            aoConfirmar={(situacao) => setPasso({ nome: "resultado", situacao })}
            aoCorrigirCpf={() => setPasso({ nome: "cpf" })}
          />
        )}
        {passo.nome === "resultado" && <TelaResultado situacao={passo.situacao} aoVoltar={() => setPasso({ nome: "cpf" })} />}
      </main>
    </div>
  );
}
