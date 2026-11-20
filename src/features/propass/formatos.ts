// Formatos do PROpass. Instante e fuso vêm do servidor (fuso da clínica): nada lê o fuso do navegador.

/** "20/11/2026 16:20", no fuso da clínica. */
export const dataHora = (iso: string, fuso: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: fuso }).format(new Date(iso)).replace(",", "");

/** "16:24", no fuso da clínica. */
export const hora = (iso: string, fuso: string) =>
  new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: fuso }).format(new Date(iso));
