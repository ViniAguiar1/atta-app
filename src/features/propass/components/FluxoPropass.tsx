"use client";

import { useState } from "react";
import { TituloDoPasso } from "@/components/ui/TituloDoPasso";
import type { DadosDoProfissional } from "../schema";
import { TEXTOS } from "../textos";
import { PassoConselho } from "./PassoConselho";
import { PassoDados } from "./PassoDados";

// PROpass do profissional, pelo celular (MIG-55; PDD v206 §10.4.3; simulador, capturas 24 a 26), como página própria,
// não modal. Este PR traz os passos 1 (dados) e 2 (conselho); o termo, a assinatura e a senha de 4 números entram nos
// próximos. Os dados ficam só no estado da tela até o envio final (api.propass_submit).
type Passo = { nome: "dados" } | { nome: "conselho"; consultadoEm: string } | { nome: "sem_validade" };

const VAZIO: DadosDoProfissional = { nome: "", cpf: "", whatsapp: "", conselho: "" as never, numero: "", uf: "" as never };

type Props = { clinica: string; email: string; conviteEm: string };

export function FluxoPropass({ clinica, email, conviteEm }: Props) {
  const [passo, setPasso] = useState<Passo>({ nome: "dados" });
  const [dados, setDados] = useState<DadosDoProfissional>(VAZIO);

  if (passo.nome === "sem_validade") return <SemValidade />;
  if (passo.nome === "conselho") {
    return <PassoConselho dados={dados} consultadoEm={passo.consultadoEm} aoVoltar={() => setPasso({ nome: "dados" })} />;
  }
  return (
    <PassoDados
      clinica={clinica}
      email={email}
      conviteEm={conviteEm}
      inicial={dados}
      aoConferir={(novos, r) => {
        setDados(novos);
        setPasso(r.situacao === "regularizado" ? { nome: "conselho", consultadoEm: r.consultadoEm } : { nome: "sem_validade" });
      }}
    />
  );
}

export function SemValidade() {
  return (
    <section className="flex flex-col gap-4">
      <TituloDoPasso>{TEXTOS.linkSemValidade}</TituloDoPasso>
      <p>{TEXTOS.linkSemValidadeAjuda}</p>
    </section>
  );
}
