import { connection } from "next/server";
import { Suspense } from "react";
import { DataState } from "@/components/ui/DataState";
import { buscarPacientes, listarPacientes } from "@/features/pacientes/actions";
import { ListaDePacientes } from "@/features/pacientes/components/ListaDePacientes";
import { textos } from "@/features/pacientes/textos";

// Pacientes (MIG-43; PDD v206 §10, "Pacientes, lista", e §10.1). A aba só aparece quando a tela usar a porta real com
// o seed (ORDEM do Tech Lead Frontend, regra 2): até lá, a rota existe, mas a casca não a lista em MODULOS_PRONTOS.
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
