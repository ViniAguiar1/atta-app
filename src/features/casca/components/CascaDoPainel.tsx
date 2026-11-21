// Casca do painel: a barra no topo e a tela logo abaixo. Não lê a rota: com cacheComponents, usePathname fora de Suspense
// quebra o build de toda rota dinâmica do painel (/painel/…/[id]). A tela do 2º fator, que fica sem a casca, mora noutro
// grupo de rota, app/(segundo-fator)/painel/seguranca, com a mesma URL (Tech Lead Frontend, depois do #199).
export function CascaDoPainel({ barra, children }: { barra: React.ReactNode; children: React.ReactNode }) {
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
