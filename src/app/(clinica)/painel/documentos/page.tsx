import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { DataState } from "@/components/ui/DataState";
import { ModelosDeDocumento } from "@/features/documentos/components/ModelosDeDocumento";
import { textos } from "@/features/documentos/textos";
import { portaDocumentos } from "@/server/documentos/porta";

// Termos & Docs (MIG-44; PDD v206 §10.3). Porta real em todo ambiente (api.atta_in_template_list na sessão do
// usuário): sem modelo, a lista vem vazia de verdade e a tela mostra o estado vazio; nada de dado de mentira na
// produção (URGENTE do Tech Lead Frontend). Quem autoriza é o banco (has_permission('documents','view')).
export const metadata: Metadata = { title: "Termos & Docs · ATTA-in" };

export default function Pagina() {
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
  return <ModelosDeDocumento resultado={await portaDocumentos.listar()} />;
}

function Carregando() {
  return (
    <DataState estado={{ tipo: "carregando" }} rotulo={textos.carregando} esqueleto={{ linhas: 4, alturaRem: 4 }} vazio={textos.vazio}>
      {null}
    </DataState>
  );
}
