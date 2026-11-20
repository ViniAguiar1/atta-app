// Faixa informativa do topo das telas (Simulador ATTA-in, capturas 19 a 23 e 09): fundo turquesa bem claro, borda de
// 3 px no turquesa informativo à esquerda, ícone "i" decorativo e um trecho em negrito no começo. Dono: Frontend 5;
// usam ATTA, Pacientes e Configurações (ORDEM do Tech Lead Frontend, componentes comuns).
type Props = {
  /** trecho em negrito no começo, ex.: "Central de Ajuda." ou "Controlador × operador:" */
  destaque?: string;
  children: React.ReactNode;
};

export function FaixaInformativa({ destaque, children }: Props) {
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-md border border-(--faixa-info-borda) border-l-3 border-l-status-info bg-(--faixa-info-bg) px-4 py-2.5 text-sm text-text-primary"
    >
      <svg
        viewBox="0 0 24 24"
        className="mt-0.5 size-4 shrink-0 text-status-info"
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
