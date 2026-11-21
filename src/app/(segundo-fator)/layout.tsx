// Grupo de rota (segundo-fator): /painel/seguranca/2fa fora da árvore do painel. A tela do 2º fator usa a moldura do site,
// como a de entrar (pedido do dono, 20/11), sem a barra nem o <main> da casca. Antes a casca decidia isso lendo a rota com
// usePathname, fora de Suspense, o que quebra o build de toda rota dinâmica do painel com cacheComponents (Tech Lead
// Frontend, #199). A URL e a guarda do proxy (ROTA_2FA) não mudam.
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
