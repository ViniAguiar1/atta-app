"use client";

import { useRouter } from "next/navigation";
import { DataState } from "@/components/ui/DataState";
import { textos } from "../textos";

// Falha na leitura do Painel: o DataState de erro, com "Tentar de novo" recarregando a rota no servidor (o código vai só
// para o suporte, nunca a mensagem do banco).
export function ErroDoPainel({ codigo }: { codigo: string }) {
  const router = useRouter();
  return (
    <DataState estado={{ tipo: "erro", codigo, tentarDeNovo: () => router.refresh() }} rotulo={textos.titulo} esqueleto={{ linhas: 3, alturaRem: 6 }} vazio={textos.painel.vazio}>
      {null}
    </DataState>
  );
}
