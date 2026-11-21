import "server-only";
import { z } from "zod";
import { falha, falhaDoBanco, MENSAGENS, ok, type ErroDoBanco } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { Database } from "@/lib/supabase/database.types";
import { criarClienteServidor } from "@/lib/supabase/server";
import { cpfHmac, normalizeCpf } from "@/server/crypto/cpf";
import {
  entradaDaAcaoSchema,
  filtroDoDiaSchema,
  filtroDoPeriodoSchema,
  filtroDosConcluidosSchema,
  termoPronto,
  type DiaDaAgenda,
  type ListaDaAgenda,
  type ResumoDaAgenda,
} from "@/features/agenda/schema";
import { lerLinhas } from "./linha";
import type { PortaAgenda } from "./porta";

// Porta real da Agenda (MIG-41) sobre api.agenda_day, api.agenda_summary (MIG-11c, #130) e api.agenda_range (Todos e
// Concluídos, #183) do Backend 2, no formato combinado em migracao/desenho/mig-41-agenda-contrato.md. Cliente de servidor com a sessão do
// usuário (RLS e has_permission), nunca a secret key (ADR 0001 §4). A resposta do banco passa pelo Zod antes de virar o
// tipo da tela; erro do banco sai por falhaDoBanco, com o reason (ADR 0001 §5). Busca: nome em p_search; CPF inteiro
// vira HMAC no servidor (p_cpf_hmac, bytea em hex com \x), nunca em claro, na URL ou no log.

// --- Formato do banco (snake_case): o dia, o período e os cards; a linha fica em ./linha.ts -----------------------
const diaDoBanco = z.object({
  local_date: z.iso.date(),
  today_local_date: z.iso.date(),
  timezone: z.string().min(1),
  // cada linha é conferida à parte: uma linha fora do formato não derruba o dia inteiro
  data: z.array(z.unknown()),
  page: z.object({ next_cursor: z.string().nullable() }),
});

/** Visões Todos e Concluídos (agenda_range): as mesmas linhas do dia, com o intervalo usado para o rótulo. */
const rangeDoBanco = z.object({
  view: z.enum(["todos", "concluidos"]),
  from: z.iso.date(),
  to: z.iso.date(),
  today_local_date: z.iso.date(),
  timezone: z.string().min(1),
  data: z.array(z.unknown()),
  page: z.object({ next_cursor: z.string().nullable() }),
});

const contagem = z.number().int().nonnegative();
const resumoDoBanco = z.object({
  today_remaining: contagem,
  today_concluded: contagem,
  month_concluded: contagem,
  month_free_slots: contagem,
  checkin: z.object({ em_preenchimento: contagem, pronto: contagem, em_atendimento: contagem }),
  confirmation: z.object({ agendados: contagem, a_confirmar: contagem, confirmados: contagem }),
  no_document: contagem,
});

// --- Cliente mínimo ---------------------------------------------------------------------------------------------------
// Os argumentos são conferidos contra os tipos gerados (database.types.ts, #130). O cliente em si entra por esta interface
// mínima, que o teste substitui: a assinatura genérica do rpc do supabase-js não encaixa nela sem o cast lá embaixo.
type FuncoesDaApi = Database["api"]["Functions"];
type ArgsDoDia = FuncoesDaApi["agenda_day"]["Args"];
type ArgsDoResumo = FuncoesDaApi["agenda_summary"]["Args"];
type ArgsDoRange = FuncoesDaApi["agenda_range"]["Args"];
type FuncoesDaAgenda = Database["atta_in"]["Functions"];
type ArgsDoConfirmar = FuncoesDaAgenda["confirm_appointment"]["Args"];
type ArgsDaTransicao = FuncoesDaAgenda["transition_appointment"]["Args"];
type RespostaDoBanco = PromiseLike<{ data: unknown; error: ErroDoBanco | null }>;
export type ClienteDaAgenda = {
  schema(nome: "api" | "atta_in"): {
    rpc(
      fn: "agenda_day" | "agenda_summary" | "agenda_range" | "confirm_appointment" | "transition_appointment",
      args: ArgsDoDia | ArgsDoResumo | ArgsDoRange | ArgsDoConfirmar | ArgsDaTransicao,
    ): RespostaDoBanco;
  };
};

/** Resposta fora do contrato: INTERNO, com o evento no log e nunca o corpo (ele tem nome e CPF mascarado). */
function foraDoFormato(evento: string) {
  logger.error(evento, { code: "INTERNO" });
  return falha("INTERNO", MENSAGENS.INTERNO);
}

export type Hmac = (cpf: string) => Buffer;

/** Resposta do agenda_range no tipo da tela; fora do formato, INTERNO com o evento no log. */
function listaDoRange(data: unknown) {
  const r = rangeDoBanco.safeParse(data);
  if (!r.success) return foraDoFormato("agenda.range_fora_do_formato");
  const lista: ListaDaAgenda = {
    hojeLocal: r.data.today_local_date,
    fuso: r.data.timezone,
    linhas: lerLinhas(r.data.data),
    proximoCursor: r.data.page.next_cursor,
  };
  return ok(lista);
}

/**
 * Busca única (decisão do Tech Lead): CPF inteiro vira p_cpf_hmac; o resto com 2+ letras vai em p_search. Devolve null
 * para termo que não sai (CPF pela metade, 1 letra) e "indisponivel" quando o HMAC falha (pepper ausente ou recusado).
 */
export function argumentosDaBusca(
  busca: string | undefined,
  hmac: Hmac = cpfHmac,
): Pick<ArgsDoDia, "p_cpf_hmac" | "p_search"> | null | "indisponivel" {
  const termo = busca?.trim();
  if (!termo) return {};
  if (!termoPronto(termo)) return null; // CPF pela metade ou 1 letra nunca sai (nada de prefixo de CPF)
  const cpf = normalizeCpf(termo);
  if (!cpf) return { p_search: termo };
  try {
    return { p_cpf_hmac: `\\x${hmac(cpf).toString("hex")}` };
  } catch {
    return "indisponivel";
  }
}

/** O que já tem leitura real no banco: o dia e os cards (MIG-11c) e as visões Todos e Concluídos (#183). Os avisos
 *  (agenda_alerts) vêm com o MIG-13. */
export type PortaAgendaReal = Pick<PortaAgenda, "dia" | "resumo" | "periodo" | "concluidos" | "acao">;

export function criarPortaAgendaReal(cliente: () => Promise<ClienteDaAgenda>, hmac: Hmac = cpfHmac): PortaAgendaReal {
  return {
    async dia(filtro) {
      const lido = filtroDoDiaSchema.safeParse(filtro);
      if (!lido.success) return falha("VALIDACAO", MENSAGENS.VALIDACAO, [{ campo: "filtro", code: "VALIDACAO" }]);
      const busca = argumentosDaBusca(lido.data.busca, hmac);
      if (busca === null) return falha("VALIDACAO", MENSAGENS.VALIDACAO, [{ campo: "busca", code: "VALIDACAO" }]);
      if (busca === "indisponivel") return foraDoFormato("agenda.hmac_indisponivel"); // sem o termo no log
      const args: ArgsDoDia = {
        ...(lido.data.dataLocal ? { p_local_date: lido.data.dataLocal } : {}),
        ...(lido.data.vinculoProfissionalId ? { p_professional_link_id: lido.data.vinculoProfissionalId } : {}),
        ...(lido.data.cursor ? { p_cursor: lido.data.cursor } : {}),
        ...(lido.data.status ? { p_status: lido.data.status } : {}),
        ...(lido.data.semDocumento ? { p_no_document: true } : {}),
        ...busca,
      };
      const { data, error } = await (await cliente()).schema("api").rpc("agenda_day", args);
      if (error) return falhaDoBanco(error);
      const dia = diaDoBanco.safeParse(data);
      if (!dia.success) return foraDoFormato("agenda.dia_fora_do_formato");
      const linhas = lerLinhas(dia.data.data);
      const resultado: DiaDaAgenda = {
        dataLocal: dia.data.local_date,
        hojeLocal: dia.data.today_local_date,
        fuso: dia.data.timezone,
        linhas,
        proximoCursor: dia.data.page.next_cursor,
      };
      return ok(resultado);
    },

    async resumo({ vinculoProfissionalId }) {
      const { data, error } = await (await cliente())
        .schema("api")
        .rpc("agenda_summary", (vinculoProfissionalId ? { p_professional_link_id: vinculoProfissionalId } : {}) satisfies ArgsDoResumo);
      if (error) return falhaDoBanco(error);
      const r = resumoDoBanco.safeParse(data);
      if (!r.success) return foraDoFormato("agenda.resumo_fora_do_formato");
      const resumo: ResumoDaAgenda = {
        hojeFaltam: r.data.today_remaining,
        hojeConcluidos: r.data.today_concluded,
        mesConcluidos: r.data.month_concluded,
        mesHorariosLivres: r.data.month_free_slots,
        checkin: {
          emPreenchimento: r.data.checkin.em_preenchimento,
          pronto: r.data.checkin.pronto,
          emAtendimento: r.data.checkin.em_atendimento,
        },
        confirmacao: {
          agendados: r.data.confirmation.agendados,
          aConfirmar: r.data.confirmation.a_confirmar,
          confirmados: r.data.confirmation.confirmados,
        },
        semDocumento: r.data.no_document,
      };
      return ok(resumo);
    },

    async periodo(filtro) {
      const lido = filtroDoPeriodoSchema.safeParse(filtro);
      if (!lido.success) return falha("VALIDACAO", MENSAGENS.VALIDACAO, [{ campo: "filtro", code: "VALIDACAO" }]);
      const busca = argumentosDaBusca(lido.data.busca, hmac);
      if (busca === null) return falha("VALIDACAO", MENSAGENS.VALIDACAO, [{ campo: "busca", code: "VALIDACAO" }]);
      if (busca === "indisponivel") return foraDoFormato("agenda.hmac_indisponivel");
      // sem período escolhido, o banco usa hoje (fuso da clínica) até +91 dias e devolve o intervalo usado
      const args: ArgsDoRange = {
        p_view: "todos",
        ...(lido.data.de ? { p_from: lido.data.de } : {}),
        ...(lido.data.ate ? { p_to: lido.data.ate } : {}),
        ...(lido.data.vinculoProfissionalId ? { p_professional_link_id: lido.data.vinculoProfissionalId } : {}),
        ...(lido.data.status ? { p_status: lido.data.status } : {}),
        ...(lido.data.cursor ? { p_cursor: lido.data.cursor } : {}),
        ...busca,
      };
      const { data, error } = await (await cliente()).schema("api").rpc("agenda_range", args);
      if (error) return falhaDoBanco(error);
      return listaDoRange(data);
    },

    async concluidos(filtro) {
      const lido = filtroDosConcluidosSchema.safeParse(filtro);
      if (!lido.success) return falha("VALIDACAO", MENSAGENS.VALIDACAO, [{ campo: "filtro", code: "VALIDACAO" }]);
      const busca = argumentosDaBusca(lido.data.busca, hmac);
      if (busca === null) return falha("VALIDACAO", MENSAGENS.VALIDACAO, [{ campo: "busca", code: "VALIDACAO" }]);
      if (busca === "indisponivel") return foraDoFormato("agenda.hmac_indisponivel");
      // semana (segunda a domingo) ou mês, calculado no banco no fuso da clínica
      const args: ArgsDoRange = {
        p_view: "concluidos",
        p_period: lido.data.periodo,
        ...(lido.data.cursor ? { p_cursor: lido.data.cursor } : {}),
        ...busca,
      };
      const { data, error } = await (await cliente()).schema("api").rpc("agenda_range", args);
      if (error) return falhaDoBanco(error);
      return listaDoRange(data);
    },

    // Ações que gravam (contrato aprovado pelo Tech Lead): a sessão do usuário, as funções do schema atta_in (que
    // conferem permissão e estado) e o erro por falhaDoBanco com o reason. O log leva só a ação e o code.
    async acao(entrada) {
      const lida = entradaDaAcaoSchema.safeParse(entrada);
      if (!lida.success) return falha("VALIDACAO", MENSAGENS.VALIDACAO, [{ campo: "acao", code: "VALIDACAO" }]);
      const banco = (await cliente()).schema("atta_in");
      const e = lida.data;
      const transicao = (args: ArgsDaTransicao) => banco.rpc("transition_appointment", args);
      const { error } =
        e.acao === "confirmar"
          ? await banco.rpc("confirm_appointment", { p_id: e.id } satisfies ArgsDoConfirmar)
          : e.acao === "marcar_ausente"
            ? await transicao({ p_id: e.id, p_to: "ausente" })
            : e.acao === "cancelar"
              ? await transicao({ p_id: e.id, p_to: "cancelado", p_reason: e.motivo })
              : await transicao({ p_id: e.id, p_to: "concluido", p_reason: e.motivo, p_justification: e.justificativa });
      // o log fica só na server action (com a ação e o code), para não sair em dobro
      return error ? falhaDoBanco(error) : ok(null);
    },
  };
}

export const portaAgendaReal: PortaAgendaReal = criarPortaAgendaReal(
  async () => (await criarClienteServidor()) as unknown as ClienteDaAgenda,
);
