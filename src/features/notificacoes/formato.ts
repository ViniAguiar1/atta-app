// Quando de cada notificação, no fuso da clínica (padrão de platform.tenant.timezone), como a captura 41: "há 12 h",
// "ontem às 18:20". Roda no servidor, com o "agora" dele; a tela só mostra o texto pronto.

export type Grupo = "hoje" | "ontem" | "anteriores";

const diaLocal = (d: Date, fuso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const hora = (d: Date, fuso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, hour: "2-digit", minute: "2-digit" }).format(d);
const diaMes = (d: Date, fuso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, day: "2-digit", month: "2-digit" }).format(d);

export function grupoDoDia(em: string, agora: Date, fuso: string): Grupo {
  const dia = diaLocal(new Date(em), fuso);
  if (dia === diaLocal(agora, fuso)) return "hoje";
  const ontem = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
  return dia === diaLocal(ontem, fuso) ? "ontem" : "anteriores";
}

/** hoje: "agora", "há 5 min", "há 12 h"; ontem: "ontem às 18:20"; antes: "18/11 às 09:05". */
export function rotuloDoQuando(em: string, agora: Date, fuso: string): string {
  const d = new Date(em);
  const grupo = grupoDoDia(em, agora, fuso);
  if (grupo === "ontem") return `ontem às ${hora(d, fuso)}`;
  if (grupo === "anteriores") return `${diaMes(d, fuso)} às ${hora(d, fuso)}`;
  const minutos = Math.max(0, Math.floor((agora.getTime() - d.getTime()) / 60000));
  if (minutos < 1) return "agora";
  return minutos < 60 ? `há ${minutos} min` : `há ${Math.floor(minutos / 60)} h`;
}
