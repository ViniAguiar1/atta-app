import "server-only";
import { falhaDeValidacao, ok } from "@/lib/errors";
import { filtroDoDiaSchema, filtroDoPeriodoSchema, filtroDosConcluidosSchema } from "@/features/agenda/schema";
import type { PortaAgenda } from "./porta";

// Porta vazia da Agenda (regra de stage do Tech Lead Frontend, 20/11): na produção, enquanto não há leitura real,
// a tela abre no estado vazio do design. Nada de dado de mentira: lista vazia e totais nulos ("—" na tela). O "hoje"
// e o fuso continuam os da clínica (padrão de platform.tenant.timezone), sem o relógio do navegador.
const FUSO = "America/Sao_Paulo";

const hojeNaClinica = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export const portaAgendaVazia: PortaAgenda = {
  async dia(filtro) {
    const lido = filtroDoDiaSchema.safeParse(filtro);
    if (!lido.success) return falhaDeValidacao(lido.error.issues);
    const hojeLocal = hojeNaClinica();
    return ok({ dataLocal: lido.data.dataLocal ?? hojeLocal, hojeLocal, fuso: FUSO, linhas: [], proximoCursor: null });
  },
  async resumo() {
    return ok({
      hojeFaltam: null,
      hojeConcluidos: null,
      mesConcluidos: null,
      mesHorariosLivres: null,
      checkin: { emPreenchimento: null, pronto: null, emAtendimento: null },
      confirmacao: { agendados: null, aConfirmar: null, confirmados: null },
      semDocumento: null,
    });
  },
  async periodo(filtro) {
    const lido = filtroDoPeriodoSchema.safeParse(filtro);
    if (!lido.success) return falhaDeValidacao(lido.error.issues);
    return ok({ hojeLocal: hojeNaClinica(), fuso: FUSO, linhas: [], proximoCursor: null });
  },
  async concluidos(filtro) {
    const lido = filtroDosConcluidosSchema.safeParse(filtro);
    if (!lido.success) return falhaDeValidacao(lido.error.issues);
    return ok({ hojeLocal: hojeNaClinica(), fuso: FUSO, linhas: [], proximoCursor: null });
  },
  async avisos() {
    return ok([]);
  },
};
