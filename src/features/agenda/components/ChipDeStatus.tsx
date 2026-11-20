import type { Status } from "../schema";
import { textos } from "../textos";

// Cores dos status (PDD §10.2.2): Agendado cinza neutro; Em preenchimento turquesa (informação); Pronto verde claro do
// ATTA-in; Em atendimento verde escuro com texto claro; Concluído verde de sucesso; Ausente e Cancelado só contorno.
// Azul nunca. Só tokens do Guia v21 (o lint `cores` reprova cor solta). O tom claro do Pronto sai da aba ativa com
// transparência até o Frontend criar um token próprio (pedido no PR).
const ESTILO: Record<Status, { chip: string; ponto: string }> = {
  agendado: { chip: "bg-surface-card text-text-primary", ponto: "bg-text-secondary" },
  em_preenchimento: { chip: "bg-status-info/15 text-text-primary", ponto: "bg-status-info" },
  pronto: { chip: "bg-brand-active/25 text-text-primary", ponto: "bg-brand-active" },
  em_atendimento: { chip: "bg-brand text-on-brand", ponto: "bg-on-brand" },
  concluido: { chip: "bg-status-success/15 text-text-primary", ponto: "bg-status-success" },
  ausente: { chip: "border border-border-functional text-text-primary", ponto: "bg-text-secondary" },
  cancelado: { chip: "border border-border-functional text-text-secondary", ponto: "bg-text-tertiary" },
};

const chip = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm whitespace-nowrap";

export function ChipDeStatus({ status }: { status: Status }) {
  const { chip: cor, ponto } = ESTILO[status];
  return (
    <span data-status={status} className={`${chip} ${cor}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${ponto}`} />
      {textos.status[status]}
    </span>
  );
}

/** Selo Atrasado, em vinho, ao lado do status: não é um estado (PDD §10.2.2). */
export function SeloAtrasado() {
  return (
    <span data-selo="atrasado" className={`${chip} bg-status-negative/10 text-status-negative`}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-status-negative" />
      {textos.atrasado}
    </span>
  );
}
