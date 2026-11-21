import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { emProducao } from "@/features/casca/abas";
import { TelaImportacao } from "@/features/configuracoes/components/TelaImportacao";
import { secaoDisponivel, secaoPorCaminho } from "@/features/configuracoes/secoes";
import { confirmarImportacao, declararImportacao, iniciarEnvioDaImportacao, previaDaImportacao, urlDoModelo } from "@/features/importacao/actions";
import { carregarImportacao, hojeNoFuso } from "@/features/importacao/queries";

// Configurações › Importação de pacientes (Simulador ATTA-in, captura 48; PDD v206 §10.1; decisão do CTO de 21/11: o fluxo
// é o mesmo componente do módulo Pacientes). Enquanto a porta for a simulada, a seção só existe fora da produção; na
// produção a porta é a vazia (tudo INDISPONIVEL) e a seção não aparece. A guarda de ADMIN é do layout de Configurações.
const acoes = {
  urlDoModelo,
  declarar: declararImportacao,
  iniciarEnvio: iniciarEnvioDaImportacao,
  previa: previaDaImportacao,
  confirmar: confirmarImportacao,
};

export default function Pagina() {
  const secao = secaoPorCaminho("importacao");
  if (!secao || !secaoDisponivel(secao, emProducao())) notFound();
  return (
    <Suspense fallback={<TelaImportacao resultado={null} acoes={acoes} hoje="" />}>
      <ComDados />
    </Suspense>
  );
}

async function ComDados() {
  await connection();
  const resultado = await carregarImportacao();
  return <TelaImportacao key={resultado.ok ? "dados" : "erro"} resultado={resultado} acoes={acoes} hoje={hojeNoFuso()} />;
}
