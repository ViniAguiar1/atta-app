"use client";

import { useEffect, useState } from "react";
import { Botao } from "@/components/ui/Botao";
import { carregarDados } from "../cadastro/actions";
import { ConfirmeSeusDados } from "../cadastro/ConfirmeSeusDados";
import type { DadosDoPaciente } from "../cadastro/schema";
import { TEXTOS as TEXTOS_CADASTRO } from "../cadastro/textos";
import type { Situacao } from "../schema";
import { PassoCodigo } from "./PassoCodigo";
import { PassoCpf } from "./PassoCpf";
import { TelaResultado } from "./TelaResultado";

// Check-in pelo celular, do QR da placa ao código (MIG-50; PDD §11.3 Caminho B e §11.4). O CPF só vive no campo:
// depois do envio, a tela guarda o desafio (uuid opaco) e o final do celular.
type Passo =
  | { nome: "cpf" }
  | { nome: "codigo"; desafio: string; finalCelular: string }
  | { nome: "resultado"; situacao: Situacao }
  | { nome: "dados"; novo: boolean };

type Props = { portal: string; clinica: string };

export function FluxoCheckin({ portal, clinica }: Props) {
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
            aoConfirmar={(situacao) =>
              setPasso(situacao === "seguir" || situacao === "cadastro_novo" ? { nome: "dados", novo: situacao === "cadastro_novo" } : { nome: "resultado", situacao })
            }
            aoCorrigirCpf={() => setPasso({ nome: "cpf" })}
          />
        )}
        {passo.nome === "dados" && <PassoDados novo={passo.novo} />}
        {passo.nome === "resultado" && <TelaResultado situacao={passo.situacao} aoVoltar={() => setPasso({ nome: "cpf" })} />}
      </main>
    </div>
  );
}

// Conferência de dados (MIG-51; PDD §11.5). Os dados vêm do servidor pelo grant do paciente, nunca da URL. O passo
// seguinte (Formulário de Saúde, MIG-52) entra no próximo PR; até lá, "Está tudo certo" salva e confirma.
function PassoDados({ novo }: { novo: boolean }) {
  const [estado, setEstado] = useState<{ tipo: "carregando" } | { tipo: "erro" } | { tipo: "pronto"; dados: DadosDoPaciente }>({ tipo: "carregando" });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    carregarDados().then((r) => vivo && setEstado(r.ok ? { tipo: "pronto", dados: r.data } : { tipo: "erro" }));
    return () => {
      vivo = false;
    };
  }, [tentativa]);

  if (estado.tipo === "carregando") return <p aria-busy="true">{TEXTOS_CADASTRO.carregando}</p>;
  if (estado.tipo === "erro")
    return (
      <div className="flex flex-col gap-4">
        <p role="alert">{TEXTOS_CADASTRO.indisponivel}</p>
        <Botao
          onClick={() => {
            setEstado({ tipo: "carregando" });
            setTentativa((n) => n + 1);
          }}
        >
          {TEXTOS_CADASTRO.tentarDeNovo}
        </Botao>
      </div>
    );
  return <ConfirmeSeusDados dados={estado.dados} novo={novo} aoConcluir={() => undefined} />;
}
