import "server-only";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { z } from "zod";
import { falha, falhaDoBanco, MENSAGENS, ok, type Resultado } from "@/lib/errors";
import { ipDoCliente } from "@/lib/http/correlacao";
import { logger } from "@/lib/logger";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { type ClienteDoLimite, consumirLimite, LIMITES } from "@/server/limite";
import { pinMac } from "@/server/pin/pin";
import type { ConferenciaDoPin, PortaBoardingCheck, ResumoDoAtendimento } from "./porta";

// Boarding Check no servidor real (MIG-23 parte 3, Backend 6), sobre as funções do #273 e do #304. PDD v206 §10.2.3,
// §13.4 e RN-FIC-07; PLANO; ADR 0004 §3. Só o servidor fala com o banco (service_role); a porta recebe só hashes.
// - confirmarPin: limite por IP ANTES de qualquer consulta (condição da Segurança e do TL no #273), depois o
//   profissional do link (api.boarding_pin_subject), o pin_mac (src/server/pin, ATTA_PIN_PEPPER; o banco nunca vê o
//   PIN) e api.boarding_confirm_pin, que conta as tentativas (5 seguidas: 15 min; 10: revoga). Link sem profissional
//   responde como os outros: 'indisponivel'.
// - abrir: api.boarding_open (Pronto → Em atendimento na primeira abertura; trilha boarding.open). Sessão inválida =
//   NAO_AUTENTICADO. O Formulário de Saúde não sai daqui: a leitura é a função única do MIG-22 (Backend 3) e entra
//   quando existir; até lá, a tela fica sem a seção (sem dado de mentira).
// - concluir: api.boarding_complete (trava dos termos; revoga o link). A trava = CONFLITO.
// Nunca vai ao log: PIN, mac, hashes nem dado do paciente.

const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Nomes dos tipos de atendimento do PDD §10.2.1 (RN-AGN-TIPO); rótulos provisórios, como os da Agenda. */
export const TIPOS_DE_ATENDIMENTO: Record<string, string> = {
  consulta: "Consulta",
  avaliacao: "Avaliação",
  procedimento: "Procedimento",
  retorno: "Retorno",
};

const conferenciaSchema = z
  .object({
    status: z.enum(["ok", "pin_incorreto", "bloqueado", "indisponivel"]),
    locked_until: z.string().regex(ISO_MS).nullable(),
  })
  .strict()
  .refine((c) => (c.status === "bloqueado") === (c.locked_until !== null));

const resumoSchema = z
  .object({
    clinic_name: z.string().min(1),
    patient_name: z.string().min(1),
    patient_age: z.number().int().min(0).nullable(),
    starts_at_local: z.string().regex(/^\d{2}:\d{2}$/),
    appointment_type: z.string().min(1),
    attended_count: z.number().int().min(0),
    absent_count: z.number().int().min(0),
    status: z.string(),
  })
  .strict();

type ErroRpc = { code?: string; message?: string; details?: string } | null;
type RespostaRpc = PromiseLike<{ data: unknown; error: ErroRpc }>;

/** O mínimo do cliente que a porta usa (testes sem o Supabase). */
export type ClienteDoBoarding = {
  schema(nome: "api"): {
    rpc(fn: "boarding_pin_subject", args: { p_link_hash: string }): RespostaRpc;
    rpc(fn: "boarding_confirm_pin", args: { p_link_hash: string; p_pin_mac: string; p_session_hash: string }): RespostaRpc;
    rpc(fn: "boarding_open", args: { p_session_hash: string }): RespostaRpc;
    rpc(fn: "boarding_complete", args: { p_session_hash: string }): RespostaRpc;
  };
};

export type DependenciasDoBoarding = {
  cliente?: () => ClienteDoBoarding;
  recebidos?: () => Promise<Headers>;
  mac?: (professionalId: string, pin: string) => Buffer;
};

const bytea = (b: Buffer) => `\\x${b.toString("hex")}`; // bytea pelo PostgREST: hex com \x
const primeira = (data: unknown) => (Array.isArray(data) ? data[0] : data);

/** Sessão inválida, vencida, de outro profissional ou concluída: o banco responde 42501 ATTA-AUTH-0004. */
function semSessao(erro: NonNullable<ErroRpc>): Resultado<never> | null {
  return erro.code === "42501" ? falha("NAO_AUTENTICADO", MENSAGENS.NAO_AUTENTICADO) : null;
}

export function criarPortaBoardingReal(deps: DependenciasDoBoarding = {}): PortaBoardingCheck {
  const cliente = deps.cliente ?? (() => criarClienteAdmin() as unknown as ClienteDoBoarding);
  const recebidos = deps.recebidos ?? headers;
  const mac = deps.mac ?? pinMac;

  return {
    async confirmarPin(hashDoLink, pin, hashDaSessao): Promise<Resultado<ConferenciaDoPin>> {
      const c = cliente();
      const ip = ipDoCliente(await recebidos(), (v) => isIP(v) !== 0);
      const limite = await consumirLimite(LIMITES.boardingPinPorIp, ip, c as unknown as ClienteDoLimite);
      if (!limite.ok) return limite;

      const sujeito = await c.schema("api").rpc("boarding_pin_subject", { p_link_hash: bytea(hashDoLink) });
      if (sujeito.error) return falhaDoBanco(sujeito.error);
      const professionalId = primeira(sujeito.data);
      if (professionalId === null || professionalId === undefined) return ok({ status: "indisponivel" });
      if (typeof professionalId !== "string" || !UUID.test(professionalId)) {
        logger.error("boarding.sujeito_fora_do_contrato");
        return falha("INTERNO", MENSAGENS.INTERNO);
      }

      let pinMacCalculado: Buffer;
      try {
        pinMacCalculado = mac(professionalId, pin);
      } catch {
        return ok({ status: "pin_incorreto" }); // PIN fora do formato: a action já recusa antes; aqui, sem oráculo
      }
      const r = await c.schema("api").rpc("boarding_confirm_pin", {
        p_link_hash: bytea(hashDoLink),
        p_pin_mac: bytea(pinMacCalculado),
        p_session_hash: bytea(hashDaSessao),
      });
      pinMacCalculado.fill(0);
      if (r.error) return falhaDoBanco(r.error);
      const lida = conferenciaSchema.safeParse(primeira(r.data));
      if (!lida.success) {
        logger.error("boarding.conferencia_fora_do_contrato");
        return falha("INTERNO", MENSAGENS.INTERNO);
      }
      if (lida.data.status === "bloqueado") return ok({ status: "bloqueado", bloqueadoAte: lida.data.locked_until! });
      return ok({ status: lida.data.status });
    },

    async abrir(hashDaSessao): Promise<Resultado<ResumoDoAtendimento>> {
      const r = await cliente().schema("api").rpc("boarding_open", { p_session_hash: bytea(hashDaSessao) });
      if (r.error) return semSessao(r.error) ?? falhaDoBanco(r.error);
      const lida = resumoSchema.safeParse(primeira(r.data));
      if (!lida.success) {
        logger.error("boarding.resumo_fora_do_contrato");
        return falha("INTERNO", MENSAGENS.INTERNO);
      }
      const d = lida.data;
      return ok({
        clinica: d.clinic_name,
        paciente: { nome: d.patient_name, idade: d.patient_age },
        horario: d.starts_at_local,
        tipoDeAtendimento: TIPOS_DE_ATENDIMENTO[d.appointment_type] ?? d.appointment_type,
        comparecimento: { atendimentos: d.attended_count, ausencias: d.absent_count },
      });
    },

    async concluir(hashDaSessao): Promise<Resultado<{ concluidoEm: string }>> {
      const r = await cliente().schema("api").rpc("boarding_complete", { p_session_hash: bytea(hashDaSessao) });
      if (r.error) return semSessao(r.error) ?? falhaDoBanco(r.error);
      const quando = primeira(r.data);
      if (typeof quando !== "string" || !ISO_MS.test(quando)) {
        logger.error("boarding.conclusao_fora_do_contrato");
        return falha("INTERNO", MENSAGENS.INTERNO);
      }
      return ok({ concluidoEm: quando });
    },
  };
}

export const portaBoardingReal: PortaBoardingCheck = criarPortaBoardingReal();
