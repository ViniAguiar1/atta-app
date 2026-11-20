import { notFound, redirect } from "next/navigation";
import { primeiraSecaoPronta, urlDaSecao } from "@/features/configuracoes/secoes";

// /painel/configuracoes abre na primeira seção pronta (a Visão geral, quando existir).
export default function Page() {
  const primeira = primeiraSecaoPronta();
  if (!primeira) notFound();
  redirect(urlDaSecao(primeira.caminho));
}
