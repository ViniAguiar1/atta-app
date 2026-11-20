import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { sessaoDoPainel } from "@/features/casca/sessao";
import { MenuDeConfiguracoes } from "@/features/configuracoes/components/MenuDeConfiguracoes";
import { textos as t } from "@/features/configuracoes/textos";

// Configurações (PDD v206 §10.4): menu lateral em grupos e a seção ao lado. Exclusiva do ADMIN (§10.4.3): quem não é
// volta ao painel. A aba já fica escondida para o Colaborador, e quem autoriza de fato é a RLS (has_permission 'settings').
export default function LayoutDeConfiguracoes({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 text-sm expanded:flex-row">
      <h1 className="sr-only">{t.titulo}</h1>
      <MenuDeConfiguracoes />
      <div className="min-w-0 flex-1">
        <Suspense fallback={null}>
          <SoAdmin>{children}</SoAdmin>
        </Suspense>
      </div>
    </div>
  );
}

async function SoAdmin({ children }: { children: React.ReactNode }) {
  await connection();
  const sessao = await sessaoDoPainel();
  if (sessao?.papel !== "ADMIN") redirect("/painel");
  return children;
}
