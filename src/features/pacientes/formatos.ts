// Data de um instante (timestamptz, que o PostgREST manda em UTC) no fuso da clínica, para "21/11 01:30 UTC" não virar o
// dia seguinte de quem cadastrou às 22h30 em São Paulo. O fuso fixo vale até o patient_get trazer o da clínica (como o
// agenda_day já traz); o mesmo padrão do formatos.ts de Documentos.
const FUSO_PADRAO = "America/Sao_Paulo";

export const dataDoInstante = (iso: string, fuso = FUSO_PADRAO) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: fuso }).format(new Date(iso));
