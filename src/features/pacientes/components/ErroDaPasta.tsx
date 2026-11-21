"use client";

import { useRouter } from "next/navigation";
import { DataState } from "@/components/ui/DataState";
import { textos } from "../textos";

/** Erro ao abrir a Pasta (banco fora, sem permissão): o DataState com "tentar de novo", que lê a ficha de novo. */
export function ErroDaPasta({ codigo }: { codigo: string }) {
  const router = useRouter();
  return (
    <DataState
      estado={{ tipo: "erro", tentarDeNovo: () => router.refresh(), codigo }}
      rotulo={textos.pasta.estado}
      esqueleto={{ linhas: 8, alturaRem: 2.5 }}
      vazio={textos.vazio}
    >
      {null}
    </DataState>
  );
}
