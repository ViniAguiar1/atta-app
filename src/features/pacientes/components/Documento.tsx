import type { Identificacao } from "@/server/pacientes/porta";
import { textos } from "../textos";

// Documento mascarado da lista e da Pasta do Paciente (ADR 0002 §6). O visual fica escondido do leitor de tela, que ouve
// o texto por extenso (padrão do painel, #29 e #44).

// o que fica à mostra na máscara única (ADR 0002 §6): "···.···.247-25" → "247-25"; "······A12" → "A12"
const final = (mascarado: string) => mascarado.replace(/^[·.]+/, "");

export function Documento({ identificacao }: { identificacao: Identificacao }) {
  if (identificacao.tipo === "incompleto") return <span>{textos.identificacao.semDocumento}</span>;
  const cpf = identificacao.tipo === "cpf";
  const falado = cpf
    ? textos.identificacao.cpfFalado(final(identificacao.mascarado))
    : textos.identificacao.estrangeiroFalado(final(identificacao.mascarado));
  return (
    <span>
      <span aria-hidden="true">{cpf ? identificacao.mascarado : `${textos.identificacao.estrangeiro} ${identificacao.mascarado}`}</span>
      <span className="sr-only">{falado}</span>
    </span>
  );
}
