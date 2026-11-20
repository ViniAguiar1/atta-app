import { redirect } from "next/navigation";

// A recepção abre o painel direto em Agendamentos, sem dashboard intermediário (PDD v206 §10.2.2).
export default function Page() {
  redirect("/painel/agenda");
}
