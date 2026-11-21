"use client";

import { useState, useTransition } from "react";
import { TituloDoPasso } from "@/components/ui/TituloDoPasso";
import { carregarTermo, enviarPropass } from "../actions";
import type { DadosDoProfissional, TermoNaTela } from "../schema";
import { TEXTOS } from "../textos";
import { PassoConcluido } from "./PassoConcluido";
import { PassoConselho } from "./PassoConselho";
import { PassoDados } from "./PassoDados";
import { PassoSenha } from "./PassoSenha";
import { type Leitura, PassoTermo } from "./PassoTermo";

// PROpass do profissional, pelo celular (MIG-55; PDD v206 §10.4.3; simulador, capturas 24 a 26), como página própria,
// não modal: 1 dados → 2 conselho → 3 Termo de Autorização (ler até o fim e assinar) → senha de 4 números → envio
// final (tudo ou nada) → 4 como você recebe documentos. Quem já tem a senha do Boarding Check (identidade do passo 2)
// pula a senha e conclui do próprio termo. O Aviso de Privacidade fica desligado até a PO mandar o texto
// oficial (CTO, P2b). Dados, assinatura e senha ficam só no estado da tela até o envio.
type Passo =
  | { nome: "dados" }
  | { nome: "conselho"; consultadoEm: string | null }
  | { nome: "termo"; termo: TermoNaTela }
  | { nome: "senha"; termo: TermoNaTela; assinatura: string; leitura: Leitura }
  | { nome: "concluido" }
  | { nome: "sem_validade" };

const VAZIO: DadosDoProfissional = { nome: "", cpf: "", whatsapp: "", conselho: "" as never, numero: "", uf: "" as never };

type Props = { clinica: string; email: string; conviteEm: string; fuso: string };

export function FluxoPropass({ clinica, email, conviteEm, fuso }: Props) {
  const [passo, setPasso] = useState<Passo>({ nome: "dados" });
  const [dados, setDados] = useState<DadosDoProfissional>(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [pedirSenha, setPedirSenha] = useState(true); // o passo 2 do servidor decide (identidade)
  const [ocupado, executar] = useTransition();

  function abrirTermo() {
    setErro(null);
    executar(async () => {
      const r = await carregarTermo(dados);
      if (!r.ok) return setErro(TEXTOS.indisponivel);
      if (r.data.situacao === "pronto") return setPasso({ nome: "termo", termo: r.data.termo });
      setPasso({ nome: "sem_validade" });
    });
  }

  async function enviar(assinatura: string, leitura: Leitura, pin: string | null): Promise<string | null> {
    const r = await enviarPropass({ dados, assinatura, leuAteOFim: true, pin, leitura });
    if (!r.ok) return TEXTOS.indisponivel;
    switch (r.data.status) {
      case "ok":
        setPasso({ nome: "concluido" });
        return null;
      case "link_sem_validade":
        setPasso({ nome: "sem_validade" });
        return null;
      case "recusado":
        return TEXTOS.recusado;
      case "limite":
        return TEXTOS.limite;
      case "senha_invalida":
        return r.data.motivo === "obvio" ? TEXTOS.senhaObvia : r.data.motivo === "formato" ? TEXTOS.senhaFormato : TEXTOS.indisponivel;
    }
  }

  switch (passo.nome) {
    case "sem_validade":
      return <Aviso titulo={TEXTOS.linkSemValidade} texto={TEXTOS.linkSemValidadeAjuda} />;
    case "concluido":
      return <PassoConcluido senhaExistente={!pedirSenha} />;
    case "senha":
      return (
        <PassoSenha
          aoVoltar={() => setPasso({ nome: "termo", termo: passo.termo })}
          aoConcluir={(pin) => enviar(passo.assinatura, passo.leitura, pin)}
        />
      );
    case "termo":
      return (
        <PassoTermo
          termo={passo.termo}
          aoVoltar={() => setPasso({ nome: "dados" })}
          rotuloDoBotao={pedirSenha ? TEXTOS.assinar : TEXTOS.concluir}
          aoAssinar={async (assinatura, leitura) => {
            if (!pedirSenha) return enviar(assinatura, leitura, null); // já tem a senha do Boarding Check
            setPasso({ nome: "senha", termo: passo.termo, assinatura, leitura });
            return null;
          }}
        />
      );
    case "conselho":
      return (
        <PassoConselho
          dados={dados}
          consultadoEm={passo.consultadoEm}
          fuso={fuso}
          ocupado={ocupado}
          erro={erro}
          aoVoltar={() => setPasso({ nome: "dados" })}
          aoContinuar={abrirTermo}
        />
      );
    default:
      return (
        <PassoDados
          clinica={clinica}
          email={email}
          conviteEm={conviteEm}
          fuso={fuso}
          inicial={dados}
          aoConferir={(novos, r) => {
            setDados(novos);
            if (r.situacao === "link_sem_validade") return setPasso({ nome: "sem_validade" });
            setPedirSenha(r.situacao === "nao_confere" ? true : r.pedirSenha);
            setPasso({ nome: "conselho", consultadoEm: r.situacao === "regularizado" ? r.consultadoEm : null });
          }}
        />
      );
  }
}

function Aviso({ titulo, texto }: { titulo: string; texto?: string }) {
  return (
    <section className="flex flex-col gap-4">
      <TituloDoPasso>{titulo}</TituloDoPasso>
      {texto && <p>{texto}</p>}
    </section>
  );
}

export function SemValidade() {
  return <Aviso titulo={TEXTOS.linkSemValidade} texto={TEXTOS.linkSemValidadeAjuda} />;
}

/** Falha do servidor ao abrir o convite (INTERNO, INDISPONIVEL): aviso genérico, sem código, e não "convite não vale". */
export function Indisponivel() {
  return <Aviso titulo={TEXTOS.indisponivel} />;
}
