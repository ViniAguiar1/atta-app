// Faixa informativa do topo das telas. Dono: Frontend 5; usam ATTA, Pacientes, Métricas e Configurações (ORDEM do
// Tech Lead Frontend, componentes comuns). Dois tons, medidos nas capturas:
// - "info" (padrão; ATTA, capturas 19 a 23, e Pacientes, 09): fundo turquesa bem claro e borda de 3 px no turquesa
//   informativo à esquerda; ~42 px numa linha;
// - "neutro" (Configurações, capturas 42 e 48): fundo branco, contorno comum e borda de 3 px no oliva da aba ativa;
//   mais justa, ~34 px numa linha, com o corpo em 13 px.
// Ícone "i" decorativo e um trecho em negrito no começo.
type Props = {
  /** trecho em negrito no começo, ex.: "Central de Ajuda." ou "Controlador × operador:" */
  destaque?: string;
  tom?: "info" | "neutro";
  children: React.ReactNode;
};

const TONS = {
  info: {
    caixa: "border-(--faixa-info-borda) border-l-status-info bg-(--faixa-info-bg) py-2.5 text-sm",
    icone: "text-status-info",
  },
  neutro: {
    caixa: "border-border border-l-(--faixa-neutra-borda) bg-surface-raised py-1.5 text-corpo",
    icone: "text-text-primary",
  },
} as const;

export function FaixaInformativa({ destaque, tom = "info", children }: Props) {
  return (
    <div role="note" className={`flex items-start gap-3 rounded-md border border-l-3 px-4 text-text-primary ${TONS[tom].caixa}`}>
      <svg
        viewBox="0 0 24 24"
        className={`mt-0.5 size-4 shrink-0 ${TONS[tom].icone}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </svg>
      <p>
        {destaque && <strong className="font-semibold">{destaque}</strong>}
        {destaque && " "}
        {children}
      </p>
    </div>
  );
}
