import type { Metadata } from "next";
import { DataState } from "@/components/ui/DataState";
import { Subabas } from "@/components/ui/Subabas";
import { SUBABAS_DE_METRICAS } from "@/features/metricas/subabas";
import { textos } from "@/features/metricas/textos";

// Métricas › Funil e tendências (PDD v206 §10.5.2: o funil de conclusão do check-in e as tendências), subaba do
// Simulador ATTA-in (captura 40). Sem a leitura real do MIG-16, o estado vazio do design, sem dado de mentira.
export const metadata: Metadata = { title: "Métricas · ATTA-in" };

export default function Pagina() {
  return (
    <>
      <Subabas rotulo={textos.subabas.rotulo} itens={SUBABAS_DE_METRICAS} ativa="/painel/metricas/funil" />
      <DataState estado={{ tipo: "vazio" }} rotulo={textos.subabas.funil} esqueleto={{ linhas: 3, alturaRem: 4 }} vazio={textos.funil.vazio}>
        {null}
      </DataState>
    </>
  );
}
