// Cartão de seção de Configurações, como no Simulador ATTA-in: cabeçalho com ícone, título e subtítulo, o texto que explica
// a regra e os campos. Ícones de traço fino (Guia de Design §7), decorativos.
type Props = { titulo: string; subtitulo?: string; icone: keyof typeof ICONES; texto?: string; children: React.ReactNode };

export function Cartao({ titulo, subtitulo, icone, texto, children }: Props) {
  return (
    <section aria-label={titulo} className="overflow-hidden rounded-md border border-border bg-surface-raised">
      <header className="flex items-center gap-3 border-b border-border bg-surface-app px-4 py-3">
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface-raised">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" focusable="false">
            <path d={ICONES[icone]} />
          </svg>
        </span>
        <div>
          <h3 className="font-semibold">{titulo}</h3>
          {subtitulo && <p className="text-xs text-text-secondary">{subtitulo}</p>}
        </div>
      </header>
      <div className="flex flex-col gap-4 p-4">
        {texto && <p className="text-text-secondary">{texto}</p>}
        {children}
      </div>
    </section>
  );
}

const ICONES = {
  link: "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1",
  confirmacao: "M4.5 6.5h15v13h-15zM4.5 10.5h15M8.5 4v4M15.5 4v4M9 15l2 2 4-4",
  ausencia: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 8v4l2.5 2.5",
} as const;
