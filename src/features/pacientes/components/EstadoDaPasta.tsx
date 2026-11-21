"use client";

import { useRouter } from "next/navigation";
import { DataState } from "@/components/ui/DataState";
import { textos } from "../textos";

// Estados da Pasta sem ficha, pelo DataState (padrão do painel): vazio (sem paciente escolhido, ou "não encontrado") com
// a volta à lista como ação, e erro com "tentar de novo", que relê a ficha.
type Props = { tipo: "vazio"; titulo: string; texto?: string } | { tipo: "erro"; codigo: string };

export function EstadoDaPasta(props: Props) {
  const router = useRouter();
  const vazio =
    props.tipo === "vazio"
      ? { titulo: props.titulo, texto: props.texto, acao: { rotulo: textos.pasta.irParaLista, aoClicar: () => router.push("/painel/pacientes") } }
      : textos.vazio;
  return (
    <DataState
      estado={props.tipo === "vazio" ? { tipo: "vazio" } : { tipo: "erro", tentarDeNovo: () => router.refresh(), codigo: props.codigo }}
      rotulo={textos.pasta.estado}
      esqueleto={{ linhas: 8, alturaRem: 2.5 }}
      vazio={vazio}
    >
      {null}
    </DataState>
  );
}
