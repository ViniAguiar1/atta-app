"use client";

import { usePathname } from "next/navigation";

// Casca do painel: a barra no topo e a tela logo abaixo. Em /painel/seguranca (2º fator) a tela usa a moldura do site,
// como a de entrar (pedido do dono, 20/11), então a casca não desenha a barra nem o <main> dela. A rota continua a mesma
// (a guarda do proxy leva o ADMIN sem 2º fator para lá).
export const SEM_CASCA = ["/painel/seguranca"];

export function CascaDoPainel({ barra, children }: { barra: React.ReactNode; children: React.ReactNode }) {
  const caminho = usePathname();
  if (SEM_CASCA.some((p) => caminho === p || caminho.startsWith(`${p}/`))) return children;
  return (
    <div className="min-h-dvh bg-surface-app">
      {barra}
      <main className="px-4 py-6 medium:px-6">{children}</main>
    </div>
  );
}
