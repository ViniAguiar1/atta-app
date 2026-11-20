import { DataState } from "@/components/ui/DataState";

// Tela de módulo que ainda não tem dado real (decisão do dono, 20/11: as 6 abas aparecem sempre). Mostra o estado
// vazio do design pelo DataState, sem dado de mentira e sem "em construção". O nome do módulo não se repete como título
// visível (PDD §10): o h1 é só para o leitor de tela. Cada módulo troca esta tela pela dele, no item dele.
type Props = { titulo: string; vazio: { titulo: string; texto: string } };

export function ModuloVazio({ titulo, vazio }: Props) {
  return (
    <>
      <h1 className="sr-only">{titulo}</h1>
      <DataState estado={{ tipo: "vazio" }} rotulo={titulo} esqueleto={{ linhas: 3, alturaRem: 4 }} vazio={vazio}>
        {null}
      </DataState>
    </>
  );
}
