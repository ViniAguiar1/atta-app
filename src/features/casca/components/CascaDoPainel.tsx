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
      {/* Espaço da barra à tela pelas capturas do simulador (1440 px): a tela começa ~16 px abaixo da barra (01, 02, 04)
          e a ~20 px das bordas; quando a tela abre com subabas (09, 19 a 23, 39, 40), a linha delas encosta na barra e
          sai da borda esquerda, com a primeira subaba alinhada ao conteúdo. Fica aqui, para nenhuma tela compensar com
          margem própria (Tech Lead Frontend, 21/11). */}
      <main
        className={
          "px-4 pt-4 pb-6 medium:px-5 has-[[data-subabas]]:pt-0 " +
          "[&_[data-subabas]]:-ml-4 [&_[data-subabas]]:pl-4 medium:[&_[data-subabas]]:-ml-5 medium:[&_[data-subabas]]:pl-5"
        }
      >
        {children}
      </main>
    </div>
  );
}
