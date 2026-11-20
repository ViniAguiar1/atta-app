import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DataState } from "@/components/ui/DataState";
import { moduloDisponivel } from "@/features/casca/abas";
import { buscarNoDia } from "@/features/agenda/actions";
import { AgendaHoje } from "@/features/agenda/components/AgendaHoje";
import { ALTURA_DA_LINHA_REM } from "@/features/agenda/components/TabelaDoDia";
import { textos } from "@/features/agenda/textos";
import { portaAgenda } from "@/server/agenda/porta";

// Agenda do painel (MIG-41; PDD v206 §10.2.2), visão Hoje. A aba só entra em MODULOS_PRONTOS com a porta real e o
// seed (ORDEM do Tech Lead Frontend). Até lá, a produção (o stage) responde 404 nesta rota; a prévia e o local abrem,
// para o QA e os e2e (moduloDisponivel, da casca).
export const metadata: Metadata = { title: "Agendamentos · ATTA-in" };

export default function Pagina() {
  // fora do Suspense, para o 404 sair antes de qualquer esqueleto (o ambiente é o do build; como no #56)
  if (!moduloDisponivel("/painel/agenda")) notFound();
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
