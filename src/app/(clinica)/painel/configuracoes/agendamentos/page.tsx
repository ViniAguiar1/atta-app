import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { TelaAgendamentos } from "@/features/configuracoes/components/TelaAgendamentos";
import { emProducao } from "@/features/casca/abas";
import { carregarParametros } from "@/features/configuracoes/queries";
import { secaoDisponivel, secaoPorCaminho } from "@/features/configuracoes/secoes";

// Configurações › Agendamentos (PDD v206 §10.2.1: "a clínica, em Configurações > Agendamentos"). Os dados são por
// requisição, com a sessão do usuário: a leitura fica no Suspense (cacheComponents), e o fallback é o carregando do DataState.
export default function Pagina() {
  return (
    <Suspense fallback={<TelaAgendamentos resultado={null} />}>
      <ComDados />
    </Suspense>
  );
}

async function ComDados() {
  await connection();
  const secao = secaoPorCaminho("agendamentos");
  if (!secao || !secaoDisponivel(secao, emProducao())) notFound(); // porta simulada: só fora da produção
  const resultado = await carregarParametros();
  // a chave recomeça a tela quando o "tentar de novo" troca o erro pelos dados
  return <TelaAgendamentos key={resultado.ok ? "dados" : "erro"} resultado={resultado} />;
}
