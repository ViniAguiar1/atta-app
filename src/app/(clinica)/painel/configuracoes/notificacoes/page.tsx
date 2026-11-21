import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { emProducao } from "@/features/casca/abas";
import { TelaNotificacoes } from "@/features/configuracoes/notificacoes/components/TelaNotificacoes";
import { carregarAlertas } from "@/features/configuracoes/notificacoes/queries";
import { secaoDisponivel, secaoPorCaminho } from "@/features/configuracoes/secoes";

// Configurações › Notificações (PDD v206 §10.4.6; captura 45). Na produção, até o MIG-15, a porta vazia: a tela abre
// no estado vazio do design. Na prévia, no local e no CI, a simulada. Os dados são por requisição, com a sessão.
export default function Pagina() {
  const secao = secaoPorCaminho("notificacoes");
  if (!secao || !secaoDisponivel(secao, emProducao())) notFound();
  return (
    <Suspense fallback={<TelaNotificacoes resultado={null} />}>
      <ComDados />
    </Suspense>
  );
}

async function ComDados() {
  await connection();
  const resultado = await carregarAlertas();
  return <TelaNotificacoes key={resultado.ok ? "dados" : "erro"} resultado={resultado} />;
}
