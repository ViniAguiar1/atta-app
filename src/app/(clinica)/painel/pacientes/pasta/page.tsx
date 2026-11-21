import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DataState } from "@/components/ui/DataState";
import { Subabas } from "@/components/ui/Subabas";
import { EstadoDaPasta } from "@/features/pacientes/components/EstadoDaPasta";
import { SUBABAS_DE_PACIENTES } from "@/features/pacientes/subabas";
import { textos } from "@/features/pacientes/textos";

// Pasta do Paciente sem paciente escolhido (subaba do Simulador ATTA-in, captura 09): o estado vazio, com a volta à lista.
// A Pasta de um paciente fica em /painel/pacientes/pasta/<id>; o endereço antigo ?paciente=<id> leva para lá.
type Props = { searchParams: Promise<{ paciente?: string | string[] }> };

export default function Page({ searchParams }: Props) {
  return (
    // captura 12: 16 px das subabas ao painel da Pasta
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">{textos.subabas.pasta}</h1>
      <Subabas rotulo={textos.subabas.rotulo} itens={SUBABAS_DE_PACIENTES} ativa="/painel/pacientes/pasta" />
      <Suspense fallback={<Carregando />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ searchParams }: Props) {
  await connection();
  const { paciente } = await searchParams;
  if (typeof paciente === "string" && paciente) redirect(`/painel/pacientes/pasta/${encodeURIComponent(paciente)}`);
  return <EstadoDaPasta tipo="vazio" titulo={textos.pasta.vazioTitulo} texto={textos.pasta.vazioTexto} />;
}

function Carregando() {
  return (
    <DataState estado={{ tipo: "carregando" }} rotulo={textos.pasta.estado} esqueleto={{ linhas: 8, alturaRem: 2.5 }} vazio={textos.vazio}>
      {null}
    </DataState>
  );
}
