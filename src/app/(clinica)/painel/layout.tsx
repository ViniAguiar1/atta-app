import { BarraDoPainel } from "@/features/casca/components/BarraDoPainel";
import { sessaoDoPainel } from "@/features/casca/sessao";

// Casca do painel da clínica (MIG-40): a barra de módulos em cima e a tela abaixo, no mesmo cartão, como no Simulador
// ATTA-in. Largura máxima de 1200 px e margem de 24 px (Guia de Design §6).
export default async function LayoutDoPainel({ children }: { children: React.ReactNode }) {
  const sessao = await sessaoDoPainel();
  return (
    <div className="mx-auto max-w-[75rem] px-6 py-6">
      <div className="rounded-md border border-border bg-surface-app">
        <BarraDoPainel sessao={sessao} />
        <main className="px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
