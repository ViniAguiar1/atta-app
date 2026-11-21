import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { sessaoDoPainel } from "@/features/casca/sessao";
import { textos } from "@/features/metricas/textos";

// Métricas é do gestor (ADMIN; PDD v206 §10.4.3 e §10.5): a aba já fica escondida do Colaborador, e as três subabas o
// devolvem ao painel antes de receber qualquer coisa. A liberação a um Colaborador específico (§10.4.3, "Métricas
// liberável") entra com as permissões por módulo do backend. Quem autoriza de fato é a RLS da leitura real (MIG-16).
export default function LayoutDeMetricas({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <SoAdmin>{children}</SoAdmin>
    </Suspense>
  );
}

async function SoAdmin({ children }: { children: React.ReactNode }) {
  await connection();
  const sessao = await sessaoDoPainel();
  if (sessao?.papel !== "ADMIN") redirect("/painel");
  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">{textos.titulo}</h1>
      {children}
    </div>
  );
}
