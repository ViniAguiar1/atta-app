import { DataState } from "@/components/ui/DataState";

// Subaba do ATTA que ainda não tem tela: o estado vazio do design pelo DataState, sem dado de mentira e sem "em
// construção" (régua do Tech Lead Frontend, 20/11; o mesmo desenho do ModuloVazio da casca).
export function SubabaVazia({ rotulo, vazio }: { rotulo: string; vazio: { titulo: string; texto: string } }) {
  return (
    <DataState estado={{ tipo: "vazio" }} rotulo={rotulo} esqueleto={{ linhas: 3, alturaRem: 4 }} vazio={vazio}>
      {null}
    </DataState>
  );
}
