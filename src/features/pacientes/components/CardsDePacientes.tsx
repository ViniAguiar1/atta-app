import { CardDeResumo } from "@/components/ui/CardDeResumo";
import { Monograma } from "@/components/ui/Monograma";
import { textos } from "../textos";

// Os 4 cards do topo de Pacientes, como o Simulador ATTA-in (captura 09): PACIENTES, RETORNO, FREQUÊNCIA MÉDIA e CSAT DO
// CHECK-IN. O total de pacientes ativos (total_active) e os "com atendimento hoje" (count_today, #158) já vêm do banco;
// os outros mostram "—" até a API trazer o número (retorno e frequência dependem da agenda; o CSAT, do check-in, MIG-13).
// Nada de número inventado.

export function CardsDePacientes({ total, hoje = null }: { total: number | null; hoje?: number | null }) {
  const c = textos.cards;
  return (
    <section aria-label={c.rotulo} className="mt-3 grid grid-cols-1 gap-4 medium:grid-cols-2 large:grid-cols-4">
      <CardDeResumo valor={total} rotulo={c.pacientes} icone={<IconePessoa />} legenda={hoje === null ? undefined : c.comAtendimentoHoje(hoje)} />
      <CardDeResumo valor={null} rotulo={c.retorno} icone={<IconeBarras />} />
      <CardDeResumo valor={null} rotulo={c.frequencia} icone={<IconeCalendario />} />
      <CardDeResumo valor={null} rotulo={c.csat} icone={<Monograma className="size-4" />} />
    </section>
  );
}

// Ícones de traço fino (Guia de Design §7), decorativos (o CardDeResumo põe aria-hidden).
function IconePessoa() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" focusable="false">
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <circle cx="12" cy="10" r="3" />
      <path d="M7 18c1-2.5 3-3.5 5-3.5s4 1 5 3.5" />
    </svg>
  );
}

function IconeBarras() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" focusable="false">
      <path d="M4 20h16M7 16v-5M12 16V7M17 16v-3" />
    </svg>
  );
}

function IconeCalendario() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" focusable="false">
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}
