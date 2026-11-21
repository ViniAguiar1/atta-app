import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { emProducao } from "@/features/casca/abas";
import { TelaPerfil } from "@/features/configuracoes/components/TelaPerfil";
import { carregarPerfil } from "@/features/configuracoes/queries";
import { secaoDisponivel, secaoPorCaminho } from "@/features/configuracoes/secoes";

// Configurações › Perfil da Clínica (PDD v206 §10.4.1; simulador, captura 42). A guarda de ADMIN fica no layout de
// Configurações; quem autoriza de fato é o api.clinic_profile (ADMIN com aal2). Os dados são por requisição, com a sessão
// do usuário, no Suspense (cacheComponents); o fallback é o carregando do DataState.
export default function Pagina() {
  const secao = secaoPorCaminho("perfil");
  if (!secao || !secaoDisponivel(secao, emProducao())) notFound();
  return (
    <Suspense fallback={<TelaPerfil resultado={null} />}>
      <ComDados />
    </Suspense>
  );
}

async function ComDados() {
  await connection();
  const resultado = await carregarPerfil();
  return <TelaPerfil key={resultado.ok ? "dados" : "erro"} resultado={resultado} />;
}
