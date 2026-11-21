import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { emProducao } from "@/features/casca/abas";
import { TelaAssinaturas } from "@/features/configuracoes/assinaturas/components/TelaAssinaturas";
import { carregarAssinaturas, carregarModelos } from "@/features/configuracoes/assinaturas/queries";
import { secaoDisponivel, secaoPorCaminho } from "@/features/configuracoes/secoes";

// Configurações › Assinaturas & Validade (PDD v206 §10.4.2; captura 46). Na produção, até o backend do Backend 6, a
// porta vazia (estado vazio do design); na prévia, no local e no CI, a simulada. Os modelos da Validade documental vêm
// de Termos & Docs (porta real). Por requisição, com a sessão.
export default function Pagina() {
  const secao = secaoPorCaminho("assinaturas");
  if (!secao || !secaoDisponivel(secao, emProducao())) notFound();
  return (
    <Suspense fallback={<TelaAssinaturas resultado={null} />}>
      <ComDados />
    </Suspense>
  );
}

async function ComDados() {
  await connection();
  const [resultado, modelos] = await Promise.all([carregarAssinaturas(), carregarModelos()]);
  return <TelaAssinaturas key={resultado.ok ? "dados" : "erro"} resultado={resultado} modelos={modelos} />;
}
