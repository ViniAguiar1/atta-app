// Formatos da Agenda. O fuso e a data vêm do servidor (fuso da clínica, ADR 0001 §4): nada lê o relógio do navegador.

/** "09:30", no fuso da clínica. */
export function horario(iso: string, fuso: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: fuso }).format(new Date(iso));
}

/** "2026-11-20" → "Sexta-feira, 20 de novembro", como a linha da data do simulador (captura 01). */
export function dataPorExtenso(dataLocal: string) {
  // meio-dia em UTC: a data do calendário não muda com nenhum fuso
  const texto = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${dataLocal}T12:00:00Z`),
  );
  return texto.charAt(0).toLocaleUpperCase("pt-BR") + texto.slice(1);
}

/** Os 5 dígitos visíveis do CPF mascarado (`···.···.247-25` → `247-25`), para o leitor de tela. */
export const finalDoCpf = (mascarado: string) => mascarado.slice(-6);
