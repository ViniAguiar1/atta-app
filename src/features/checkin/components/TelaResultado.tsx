"use client";

import { Botao } from "@/components/ui/Botao";
import type { Situacao } from "../schema";
import { TEXTOS } from "../textos";
import { TituloDoPasso as Titulo } from "@/components/ui/TituloDoPasso";

// Desfecho depois do código (PDD §11.4 e §11.9). "seguir" e "cadastro_novo" levam ao cadastro (MIG-51), que entra no
// próximo PR; até lá a tela só confirma a identidade.
const DESFECHOS: Record<Situacao, { titulo: string; texto?: string; voltar?: boolean }> = {
  seguir: { titulo: "Identidade confirmada", texto: "Agora você vai conferir os seus dados." },
  cadastro_novo: { titulo: "Identidade confirmada", texto: TEXTOS.cadastroNovo },
  concluido: { titulo: TEXTOS.concluido },
  cancelado: { titulo: TEXTOS.semAtendimento }, // só o literal do PDD §11.9
  ausente: { titulo: TEXTOS.ausenteTitulo, texto: TEXTOS.ausenteTexto, voltar: true },
  divergencia: { titulo: TEXTOS.divergencia },
};

export function TelaResultado({ situacao, aoVoltar }: { situacao: Situacao; aoVoltar: () => void }) {
  const { titulo, texto, voltar } = DESFECHOS[situacao];
  return (
    <section className="flex flex-col gap-4">
      <Titulo>{titulo}</Titulo>
      {texto && <p>{texto}</p>}
      {voltar && (
        <Botao variante="secundario" onClick={aoVoltar} className="mt-4">
          {TEXTOS.voltarAoInicio}
        </Botao>
      )}
    </section>
  );
}
