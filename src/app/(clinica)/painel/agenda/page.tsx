import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { DataState } from "@/components/ui/DataState";
import { buscarNoDia } from "@/features/agenda/actions";
import { AgendaHoje } from "@/features/agenda/components/AgendaHoje";
import { ALTURA_DA_LINHA_REM } from "@/features/agenda/components/TabelaDoDia";
import { textos } from "@/features/agenda/textos";
import { portaAgenda } from "@/server/agenda/porta";

// Agenda do painel (MIG-41; PDD v206 §10.2.2), visão Hoje. A aba só entra em MODULOS_PRONTOS com a porta real e o
// seed (ORDEM do Tech Lead Frontend); até lá a rota existe, mas a barra não mostra a aba.
export const metadata: Metadata = { title: "Agendamentos · ATTA-in" };

export default function Pagina() {
  return (
    <Suspense fallback={<Carregando />}>
      <Hoje />
    </Suspense>
  );
}

async function Hoje() {
  await connection(); // por requisição: o "hoje" é o da clínica na hora do pedido
  const inicial = await portaAgenda.dia({});
  return <AgendaHoje inicial={inicial} buscar={buscarNoDia} />;
}

function Carregando() {
  return (
    <DataState
      estado={{ tipo: "carregando" }}
      rotulo={textos.rotuloDaLista}
      esqueleto={{ linhas: 5, alturaRem: ALTURA_DA_LINHA_REM }}
      vazio={textos.vazio}
    >
      {null}
    </DataState>
  );
}
