"use client";

import { useRouter } from "next/navigation";
import { DataState } from "@/components/ui/DataState";
import type { Resultado } from "@/lib/errors";
import type { MeusModelos } from "@/server/documentos/porta";
import { textos } from "../textos";
import { CardsDosModelos } from "./CardsDosModelos";
import { SubabasDeDocumentos } from "./SubabasDeDocumentos";
import { TabelaDeModelos } from "./TabelaDeModelos";

// Termos & Docs › Modelos de documento (MIG-44; PDD v206 §10.3.1; simulador, captura 39). Os inativos ficam fora da
// lista padrão (PDD §10.3.1, filtro "Inativo"); o rodapé conta os mostrados de todos. Ficam fora até terem destino:
// "+ Novo modelo", o filtro e o menu ⋮ (este com as ações do #69, num PR seguinte).
export function ModelosDeDocumento({ resultado }: { resultado: Resultado<MeusModelos> }) {
  const router = useRouter();
  const visiveis = resultado.ok ? resultado.data.modelos.filter((m) => m.estado !== "inativo") : [];
  const estado = !resultado.ok
    ? ({ tipo: "erro", tentarDeNovo: () => router.refresh(), codigo: resultado.error.code } as const)
    : visiveis.length === 0
      ? ({ tipo: "vazio" } as const)
      : ({ tipo: "pronto" } as const);

  return (
    <div className="flex flex-col gap-5">
      <SubabasDeDocumentos ativa="/painel/documentos" />
      {resultado.ok && <CardsDosModelos resumo={resultado.data.resumo} />}
      <DataState estado={estado} rotulo={textos.carregando} esqueleto={{ linhas: 4, alturaRem: 4 }} vazio={textos.vazio}>
        <TabelaDeModelos modelos={visiveis} />
      </DataState>
      {resultado.ok && visiveis.length > 0 && (
        <p className="text-[0.8125rem] text-text-secondary">{textos.rodape(visiveis.length, resultado.data.modelos.length)}</p>
      )}
    </div>
  );
}
