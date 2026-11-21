import { redirect } from "next/navigation";
import { connection } from "next/server";
import { podeAbrirAba } from "@/features/casca/abas";
import { sessaoDoPainel } from "@/features/casca/sessao";
import { textos } from "@/features/metricas/textos";

// Métricas é do gestor e liberável ao Colaborador (PDD v206 §10.4.3 e §10.5): abre para o ADMIN e para o Colaborador com
// metrics.view na própria matriz, pela mesma regra que mostra a aba (podeAbrirAba). Quem não pode volta ao painel antes
// de receber qualquer coisa. Quem autoriza de fato é a leitura real (MIG-16), com has_permission('metrics', 'view').
export async function GuardaDeMetricas({ children }: { children: React.ReactNode }) {
  await connection();
  const sessao = await sessaoDoPainel();
  if (!podeAbrirAba("/painel/metricas", sessao?.papel ?? null, sessao?.permissoes ?? [])) redirect("/painel");
  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">{textos.titulo}</h1>
      {children}
    </div>
  );
}
