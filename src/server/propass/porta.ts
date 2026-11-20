import "server-only";
import type { Resultado } from "@/lib/errors";
import type { Conselho } from "@/features/propass/schema";
import { portaPropassSimulada } from "./simulado";

// Contrato entre as telas do PROpass (MIG-55, Frontend 6) e o domínio (MIG-14b, Backend 4). PDD v206 §10.4.3; ADR
// 0004 §3. O profissional não tem login: o convite chega por e-mail com o link /propass/<segredo>, que o GET não
// consome (vira o cookie atta_propass_link). A porta só recebe o sha256 do segredo; clínica e vínculo saem do grant,
// nunca do navegador. Só o envio final (api.propass_submit, no PR do termo) consome o link.

/** `api.propass_resolve`: o e-mail do convite volta decifrado no servidor, para a tela mostrar travado. */
export type ConvitePropass = {
  clinica: string;
  emailDoConvite: string;
  conviteEm: string; // ISO 8601: emissão deste link (invited_at; o convite ou o último "Reenviar Link")
  fuso: string; // fuso da clínica (IANA); a tela formata as horas nele, nunca no relógio do navegador
  etapa: "dados" | "termo";
};

export type RegistroNoConselho = { conselho: Conselho; numero: string; uf: string; nome: string };

/** Situação do registro (porta do conselho do Backend 4, src/server/conselho/). A consulta à base do conselho é serviço
 * externo e espera a PO (R20): até lá, a produção só devolve `nao_consultado`, e "Regularizado" só com consulta real. */
export type SituacaoDoConselho =
  | { situacao: "regularizado"; consultadoEm: string } // ISO 8601
  | { situacao: "nao_confere" }
  | { situacao: "nao_consultado" };

export type PortaPropass = {
  /** NAO_ENCONTRADO: link desconhecido, vencido (7 dias), revogado ou de vínculo excluído (a mesma resposta). */
  resolver(hashDoLink: Buffer): Promise<Resultado<ConvitePropass>>;
  /** Camada 1 — Validação ATTA (Conselho), PDD §10.4.3. NAO_ENCONTRADO: como em `resolver`. */
  conferirConselho(hashDoLink: Buffer, registro: RegistroNoConselho): Promise<Resultado<SituacaoDoConselho>>;
};

export const portaPropass: PortaPropass = portaPropassSimulada;
