import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { emProducao } from "@/features/casca/abas";
import { TelaAgendamentos } from "@/features/configuracoes/components/TelaAgendamentos";
import { carregarAgendamentos } from "@/features/configuracoes/queries";
import { secaoDisponivel, secaoPorCaminho } from "@/features/configuracoes/secoes";

// Configurações › Agendamentos (PDD v206 §10.2.1: "a clínica, em Configurações > Agendamentos"). A seção é conferida fora
// do Suspense, para o 404 sair antes do esqueleto (o ambiente é o do build). Os dados são por requisição, com a sessão do
// usuário: a leitura fica no Suspense (cacheComponents), e o fallback é o carregando do DataState.
export default function Pagina() {
  const secao = secaoPorCaminho("agendamentos");
  if (!secao || !secaoDisponivel(secao, emProducao())) notFound(); // porta simulada: só fora da produção
  return (
    <Suspense fallback={<TelaAgendamentos resultado={null} />}>
      <ComDados />
    </Suspense>
  );
}

async function ComDados() {
  await connection();
  const resultado = await carregarAgendamentos();
  // a chave recomeça a tela quando o "tentar de novo" troca o erro pelos dados
  return <TelaAgendamentos key={resultado.ok ? "dados" : "erro"} resultado={resultado} />;
}
