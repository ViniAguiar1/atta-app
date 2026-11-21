// Símbolo do ATTA como no Simulador ATTA-in (print 28 do dono): a perna reta do A, a barra do T e o traço curvo que
// acolhe (Guia de Design §7), em formas cheias de traço grosso (no print, ~29 × 26 px na barra). Decorativo. O arquivo
// oficial do logo entra quando o dono mandar a pasta de identidade para o repo; até lá, este desenho segue o print.
export function Monograma({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 26" className={className} fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M13.2 0h3.4L30 26h-3.9z" />
      <path d="M9.6 9.8h18v2.7h-18z" />
      <path d="M.6 26C2.2 18.4 5.6 12.4 10.4 9.8l1 2.7C8.2 14.6 6.4 19.4 5.4 26z" />
    </svg>
  );
}
