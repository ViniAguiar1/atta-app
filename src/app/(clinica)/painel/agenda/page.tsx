import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { DataState } from "@/components/ui/DataState";
import { buscarConcluidos, buscarNoDia, buscarNoPeriodo, executarAcao, resumirDia } from "@/features/agenda/actions";
import { AgendaHoje } from "@/features/agenda/components/AgendaHoje";
import { ALTURA_DA_LINHA_REM } from "@/features/agenda/components/TabelaDoDia";
import { textos } from "@/features/agenda/textos";
import { portaAgenda } from "@/server/agenda/porta";

// Agenda do painel (MIG-41; PDD v206 §10.2.2), visão Hoje. A aba aparece sempre (decisão do dono, 20/11), sem 404: sem a
// porta real, a produção usa a porta vazia (lista vazia e "—" nos números) e a prévia, o local e o CI usam a simulada
// (src/server/agenda/porta.ts).
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
  const [inicial, resumoInicial] = await Promise.all([portaAgenda.dia({}), portaAgenda.resumo({})]);
  return (
    <AgendaHoje
      inicial={inicial}
      resumoInicial={resumoInicial}
      buscar={buscarNoDia}
      buscarPeriodo={buscarNoPeriodo}
      buscarConcluidos={buscarConcluidos}
      resumir={resumirDia}
      executar={executarAcao}
    />
  );
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
