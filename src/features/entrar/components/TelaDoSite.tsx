// Moldura das telas de entrar (login, esqueci a senha, nova senha e 2º fator), como a página "Entrar" do artefato aprovado
// "Site ATTA-in" (pedido do dono, 20/11): o fundo verde da marca de ponta a ponta e o cartão no centro. Sem o cabeçalho e
// o rodapé do site (correção do dono), sem a linha de demonstração e sem o botão do WhatsApp. As cores do fundo e do
// cartão ficam no globals.css (.sobre-marca, .cartao-do-site), com o contraste conferido.
export function TelaDoSite({ children }: { children: React.ReactNode }) {
  return (
    <main className="sobre-marca flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="cartao-do-site w-full max-w-md rounded-xl px-6 py-8 medium:px-10">{children}</div>
    </main>
  );
}
