import { connection } from "next/server";
import { SemAcesso } from "@/components/ui/DataState";
import { podeAbrirAba } from "@/features/casca/abas";
import { sessaoDoPainel } from "@/features/casca/sessao";
import { textos } from "@/features/metricas/textos";

// Métricas é do gestor e liberável ao Colaborador (PDD v206 §10.4.3 e §10.5): abre para o ADMIN e para o Colaborador com
// metrics.view na própria matriz, pela mesma regra que mostra a aba (podeAbrirAba). Quem não pode vê o "sem acesso", antes
// de qualquer leitura (S2 da QA, 21/11). Quem autoriza de fato é a leitura real (MIG-16), com has_permission('metrics', 'view').
export async function GuardaDeMetricas({ children }: { children: React.ReactNode }) {
  await connection();
  const sessao = await sessaoDoPainel();
  const pode = podeAbrirAba("/painel/metricas", sessao?.papel ?? null, sessao?.permissoes ?? []);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">{textos.titulo}</h1>
      {pode ? children : <SemAcesso rotulo={textos.titulo} />}
    </div>
  );
}
