// A data da assinatura vem do servidor em ISO (UTC). A página é pública e não sabe o fuso da clínica: mostra no horário
// de Brasília, no formato da captura 54 ("2026-03-04 10:12").
export function dataDaAssinatura(iso: string): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Sao_Paulo",
  }).formatToParts(new Date(iso));
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "";
  return `${p("year")}-${p("month")}-${p("day")} ${p("hour")}:${p("minute")}`;
}
