import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { emProducao, moduloDisponivel } from "@/features/casca/abas";
import { sessaoDoPainel } from "@/features/casca/sessao";
import { MenuDeConfiguracoes } from "@/features/configuracoes/components/MenuDeConfiguracoes";
import { gruposDisponiveis } from "@/features/configuracoes/secoes";
import { textos as t } from "@/features/configuracoes/textos";

// Configurações (PDD v206 §10.4): menu lateral em grupos e a seção ao lado. Exclusiva do ADMIN (§10.4.3): quem não é
// volta ao painel antes de receber qualquer coisa (o menu também fica atrás da guarda). Quem autoriza de fato é a RLS.
export default function LayoutDeConfiguracoes({ children }: { children: React.ReactNode }) {
  // fora do Suspense, para o 404 sair antes de qualquer esqueleto (o ambiente é o do build)
  if (!moduloDisponivel("/painel/configuracoes")) notFound();
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
    <div className="flex flex-col gap-6 text-sm expanded:flex-row">
      <h1 className="sr-only">{t.titulo}</h1>
      <MenuDeConfiguracoes grupos={gruposDisponiveis(emProducao())} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
