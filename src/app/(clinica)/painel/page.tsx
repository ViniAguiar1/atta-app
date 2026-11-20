import { redirect } from "next/navigation";
import { MODULOS_PRONTOS } from "@/features/casca/abas";

// A recepção abre o painel direto em Agendamentos, sem dashboard intermediário (PDD v206 §10.2.2): o primeiro módulo
// pronto. Antes de haver módulo pronto, o painel mostra só a barra.
export default function Page() {
  const [primeiro] = MODULOS_PRONTOS;
  if (primeiro) redirect(primeiro);
  return null;
}
