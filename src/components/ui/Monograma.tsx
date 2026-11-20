// Monograma de traço (o A que acolhe e o T que estrutura, Guia de Design §7), decorativo. O arquivo oficial do logo
// entra quando o dono mandar a pasta de identidade para o repo.
export function Monograma({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M4 20 11 4l3 7M9 13h10M14.5 13v7" />
    </svg>
  );
}
