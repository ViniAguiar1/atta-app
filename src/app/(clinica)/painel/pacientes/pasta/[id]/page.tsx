import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { DataState } from "@/components/ui/DataState";
import { Subabas } from "@/components/ui/Subabas";
import { ErroDaPasta } from "@/features/pacientes/components/ErroDaPasta";
import { PastaDoPaciente } from "@/features/pacientes/components/PastaDoPaciente";
import { abrirPasta } from "@/features/pacientes/pasta";
import { SUBABAS_DE_PACIENTES } from "@/features/pacientes/subabas";
import { textos } from "@/features/pacientes/textos";

// Pasta de um paciente (Simulador ATTA-in, captura 12; PDD v206 §10: o nome na lista abre a Pasta). Subaba "Pasta do
// Paciente" ativa. Paciente de outra clínica, id inválido ou arquivo apagado dão o mesmo "não encontrado", sem dizer
// se a pessoa existe na rede.
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">{textos.subabas.pasta}</h1>
      <Subabas rotulo={textos.subabas.rotulo} itens={SUBABAS_DE_PACIENTES} ativa="/painel/pacientes/pasta" />
      <Suspense fallback={<Carregando />}>
        <Conteudo params={params} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ params }: { params: Promise<{ id: string }> }) {
  await connection(); // por requisição: a ficha é da clínica da sessão, e cada abertura fica na Auditoria
  const { id } = await params;
  const ficha = await abrirPasta(id);
  if (ficha.ok) return <PastaDoPaciente ficha={ficha.data} />;
  if (ficha.error.code === "NAO_ENCONTRADO" || ficha.error.code === "VALIDACAO") {
    return (
      <section className="flex flex-col items-start gap-2 rounded-md border border-border bg-surface-raised p-6">
        <p className="font-sub text-lg text-text-primary">{textos.pasta.naoEncontrado}</p>
        <Link
          href="/painel/pacientes"
          className="mt-2 inline-flex min-h-11 items-center rounded-md border border-border-functional px-5 font-medium text-text-primary hover:bg-surface-card"
        >
          {textos.pasta.irParaLista}
        </Link>
      </section>
    );
  }
  return <ErroDaPasta codigo={ficha.error.code} />;
}

function Carregando() {
  return (
    <DataState estado={{ tipo: "carregando" }} rotulo={textos.pasta.estado} esqueleto={{ linhas: 8, alturaRem: 2.5 }} vazio={textos.vazio}>
      {null}
    </DataState>
  );
}
