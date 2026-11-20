"use client";

import type { Situacao } from "../schema";
import { TEXTOS } from "../textos";
import { Titulo } from "./Titulo";

// Desfecho depois do código (PDD §11.4 e §11.9). "seguir" e "cadastro_novo" levam ao cadastro (MIG-51), que entra no
// próximo PR; até lá a tela só confirma a identidade.
const DESFECHOS: Record<Situacao, { titulo: string; texto?: string }> = {
  seguir: { titulo: "Identidade confirmada", texto: "Agora você vai conferir os seus dados." },
  cadastro_novo: { titulo: "Identidade confirmada", texto: TEXTOS.cadastroNovo },
  concluido: { titulo: TEXTOS.concluido },
  cancelado: { titulo: TEXTOS.semAtendimento, texto: "Procure a recepção." },
  ausente: { titulo: "Procure a recepção", texto: "A recepção pode reabrir o seu check-in." }, // PDD sem texto literal
  divergencia: { titulo: TEXTOS.divergencia },
};

export function TelaResultado({ situacao }: { situacao: Situacao }) {
  const { titulo, texto } = DESFECHOS[situacao];
  return (
    <section className="flex flex-col gap-4">
      <Titulo>{titulo}</Titulo>
      {texto && <p>{texto}</p>}
    </section>
  );
}
