import { connection } from "next/server";
import { Suspense } from "react";
import { SubabasDoAtta } from "@/features/atta/components/SubabasDoAtta";
import { TelaAjuda } from "@/features/atta/components/TelaAjuda";
import { HREF } from "@/features/atta/subabas";
import { portaImportacao } from "@/server/importacao/porta";

// ATTA › Central de Ajuda, PDD v206 §10.6.1, captura 19. É a subaba que /painel/atta abre, como no simulador. A URL da
// planilha modelo de pacientes (§10.1) vem da porta da importação (Frontend 3 / Integrações), por requisição: quando ela
// passar a devolver a URL assinada de vida curta, o ATTA acompanha sem mudança.
export default function Page() {
  return (
    <>
      <SubabasDoAtta ativa={HREF.ajuda} />
      <Suspense fallback={<TelaAjuda />}>
        <ComPlanilha />
      </Suspense>
    </>
  );
}

async function ComPlanilha() {
  await connection();
  const r = await portaImportacao.urlDoModelo();
  return <TelaAjuda planilha={r.ok ? r.data : null} />;
}
