import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { sessaoDoPainel } from "@/features/casca/sessao";
import { ModuloVazio } from "@/features/casca/components/ModuloVazio";
import { textos } from "@/features/casca/textos";

// Métricas: a aba aparece sempre (decisão do dono, 20/11). Até a tela do módulo (MIG-46, Frontend), o estado vazio do design.
export const metadata: Metadata = { title: "Métricas · ATTA-in" };

const t = textos.vazios.metricas;

// Métricas é do gestor (ADMIN; PDD §10.4.3 e §10.5): a aba já fica escondida do Colaborador, e a rota o devolve ao painel.
export default function Pagina() {
  return (
    <Suspense fallback={null}>
      <SoAdmin />
    </Suspense>
  );
}

async function SoAdmin() {
  await connection();
  const sessao = await sessaoDoPainel();
  if (sessao?.papel !== "ADMIN") redirect("/painel");
  return <ModuloVazio titulo={t.titulo} vazio={t.vazio} />;
}
