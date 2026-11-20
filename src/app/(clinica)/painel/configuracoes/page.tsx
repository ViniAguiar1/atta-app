import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { emProducao } from "@/features/casca/abas";
import { primeiraSecaoDisponivel, urlDaSecao } from "@/features/configuracoes/secoes";

// /painel/configuracoes abre na primeira seção disponível (a Visão geral, quando existir).
export default async function Page() {
  await connection(); // o ambiente é lido na requisição
  const primeira = primeiraSecaoDisponivel(emProducao());
  if (!primeira) notFound();
  redirect(urlDaSecao(primeira.caminho));
}
