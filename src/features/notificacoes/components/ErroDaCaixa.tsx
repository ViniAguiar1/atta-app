"use client";

import { useRouter } from "next/navigation";
import { DataState } from "@/components/ui/DataState";
import { textos } from "../textos";

// Falha na leitura da caixa: o DataState de erro, com "Tentar de novo" relendo a rota no servidor.
export function ErroDaCaixa({ codigo }: { codigo: string }) {
  const router = useRouter();
  return (
    <DataState estado={{ tipo: "erro", codigo, tentarDeNovo: () => router.refresh() }} rotulo={textos.lista} esqueleto={{ linhas: 3, alturaRem: 6 }} vazio={textos.vazio}>
      {null}
    </DataState>
  );
}
