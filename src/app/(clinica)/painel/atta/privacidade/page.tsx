import { connection } from "next/server";
import { Suspense } from "react";
import { DataState } from "@/components/ui/DataState";
import { SubabasDoAtta } from "@/features/atta/components/SubabasDoAtta";
import { TelaPrivacidade } from "@/features/atta/components/TelaPrivacidade";
import { HREF } from "@/features/atta/subabas";
import { textos } from "@/features/atta/textos";
import { sessaoDoPainel } from "@/features/casca/sessao";
import { portaAtta } from "@/server/atta/porta";

// ATTA › Privacidade & Dados (LGPD), PDD v206 §10.6.3, captura 21. Os números são da clínica da sessão (RLS).
export default function Page() {
  return (
    <>
      <SubabasDoAtta ativa={HREF.privacidade} />
      <Suspense fallback={<Carregando />}>
        <Conteudo />
      </Suspense>
    </>
  );
}

async function Conteudo() {
  await connection(); // por requisição: os números são da clínica da sessão
  const [sessao, resumo] = await Promise.all([sessaoDoPainel(), portaAtta.resumoDosDados()]);
  return <TelaPrivacidade clinica={sessao?.clinica ?? null} resumo={resumo} />;
}

function Carregando() {
  return (
    <DataState estado={{ tipo: "carregando" }} rotulo={textos.subabas.privacidade} esqueleto={{ linhas: 4, alturaRem: 6 }} vazio={{ titulo: textos.subabas.privacidade, texto: textos.privacidade.transparencia.subtitulo }}>
      {null}
    </DataState>
  );
}
