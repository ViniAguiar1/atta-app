// Ícones de traço fino dos cartões de Configurações (Guia de Design §7), decorativos: o CartaoDeSecao põe aria-hidden.
const Icone = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" focusable="false">
    <path d={d} />
  </svg>
);

export const IconeLink = () => (
  <Icone d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
);
export const IconeConfirmacao = () => <Icone d="M4.5 6.5h15v13h-15zM4.5 10.5h15M8.5 4v4M15.5 4v4M9 15l2 2 4-4" />;
export const IconeAusencia = () => <Icone d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 8v4l2.5 2.5" />;
export const IconeFluxo = () => <Icone d="M4 9h13l-3-3M20 15H7l3 3" />;
export const IconeMensagens = () => <Icone d="M4.5 5.5h15v10h-9l-4 3v-3h-2z" />;
