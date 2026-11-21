// Ícones de traço fino dos cards de resumo (Guia de Design §7), decorativos: quem usa põe aria-hidden.
const Icone = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" focusable="false">
    <path d={d} />
  </svg>
);

export const IconeCamadas = () => <Icone d="M12 4 3 9l9 5 9-5-9-5zM3 14l9 5 9-5" />;
export const IconeDocumento = () => <Icone d="M7 3.5h7l4 4v13H7zM14 3.5v4h4M9.5 12.5h6M9.5 16h6" />;
export const IconeLista = () => <Icone d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01" />;
export const IconeConferido = () => <Icone d="M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM8.5 12l2.5 2.5 4.5-5" />;
