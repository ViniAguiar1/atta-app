import type { Metadata } from "next";
import { Suspense } from "react";
import { DataState } from "@/components/ui/DataState";
import { Subabas } from "@/components/ui/Subabas";
import { ErroDoPainel } from "@/features/metricas/components/ErroDoPainel";
import { PainelDeMetricas } from "@/features/metricas/components/PainelDeMetricas";
import { SUBABAS_DE_METRICAS } from "@/features/metricas/subabas";
import { textos } from "@/features/metricas/textos";
import { portaMetricas } from "@/server/metricas/porta";

// Métricas › Painel (MIG-46; PDD v206 §10.5), como o Simulador ATTA-in (captura 40). A guarda de ADMIN fica no layout.
// Os números vêm da porta (src/server/metricas): vazia na produção até o MIG-16, simulada na prévia, no local e no CI.
export const metadata: Metadata = { title: "Métricas · ATTA-in" };

export default function Pagina() {
  return (
    <>
      <Subabas rotulo={textos.subabas.rotulo} itens={SUBABAS_DE_METRICAS} ativa="/painel/metricas" />
      <Suspense fallback={<DataState estado={{ tipo: "carregando" }} rotulo={textos.titulo} esqueleto={{ linhas: 3, alturaRem: 6 }} vazio={textos.painel.vazio}>{null}</DataState>}>
        <Conteudo />
      </Suspense>
    </>
  );
}

async function Conteudo() {
  const r = await portaMetricas.painel();
  if (!r.ok) return <ErroDoPainel codigo={r.error.code} />;
  return <PainelDeMetricas dados={r.data} />;
}
