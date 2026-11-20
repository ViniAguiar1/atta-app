import { connection } from "next/server";
import { Suspense } from "react";
import { DataState } from "@/components/ui/DataState";
import { buscarPacientes, listarPacientes } from "@/features/pacientes/actions";
import { ListaDePacientes } from "@/features/pacientes/components/ListaDePacientes";
import { textos } from "@/features/pacientes/textos";

// Pacientes (MIG-43; PDD v206 §10, "Pacientes, lista", e §10.1), com a porta real. As abas do painel aparecem sempre
// (decisão do dono, 20/11): sem 404 nesta rota.
export default function Page() {
  return (
    <>
      <h1 className="sr-only">{textos.titulo}</h1>
      <Suspense fallback={<Carregando />}>
        <Lista />
      </Suspense>
    </>
  );
}

async function Lista() {
  await connection(); // por requisição: a lista é da clínica da sessão
  const inicial = await listarPacientes();
  return <ListaDePacientes inicial={inicial} listar={listarPacientes} buscar={buscarPacientes} />;
}

function Carregando() {
  return (
    <DataState estado={{ tipo: "carregando" }} rotulo={textos.estado} esqueleto={{ linhas: 6, alturaRem: 4 }} vazio={textos.vazio}>
      {null}
    </DataState>
  );
}
