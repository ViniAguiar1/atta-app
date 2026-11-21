import "server-only";
import type { Resultado } from "@/lib/errors";
import type { Conselho } from "@/features/propass/schema";
import { portaPropassSimulada } from "./simulado";

// Contrato entre as telas do PROpass (MIG-55, Frontend 6) e o domínio (MIG-14b, Backend 4). PDD v206 §10.4.3; ADR
// 0004 §3. O profissional não tem login: o convite chega por e-mail com o link /propass/<segredo>, que o GET não
// consome (vira o cookie atta_propass_link). A porta só recebe o sha256 do segredo; clínica e vínculo saem do grant,
// nunca do navegador. Só o envio final (api.propass_submit) consome o link: dados, PIN e o Termo de Autorização
// assinado no ATTA Sign, numa transação só (Backend 4 e Backend 3, 21/11).

/** `api.propass_resolve`: o e-mail do convite volta decifrado no servidor, para a tela mostrar travado. */
export type ConvitePropass = {
  clinica: string;
  emailDoConvite: string;
  conviteEm: string; // ISO 8601: emissão deste link (invited_at; o convite ou o último "Reenviar Link")
  fuso: string; // fuso da clínica (IANA); a tela formata as horas nele, nunca no relógio do navegador
};

export type RegistroNoConselho = { conselho: Conselho; numero: string; uf: string; nome: string };

/** Situação do registro (porta do conselho do Backend 4, src/server/conselho/). A consulta à base do conselho é serviço
 * externo e espera a PO (R20): até lá, a produção só devolve `nao_consultado`, e "Regularizado" só com consulta real. */
export type SituacaoDoConselho =
  | { situacao: "regularizado"; consultadoEm: string } // ISO 8601
  | { situacao: "nao_confere" }
  | { situacao: "nao_consultado" };

/** Termo de Autorização de Uso de Imagem de Assinatura Digital (PDD §10.4.3), já com os dados do profissional: a
 * versão vigente do modelo de sistema (kind termo_de_autorizacao, igual em todas as clínicas; decisão do CTO, P2c). */
export type TermoDeAutorizacao = { titulo: string; paragrafos: string[] };

/** O que o servidor recebe no envio final. O PNG da assinatura sobe cifrado no servidor (ATTA Sign, Backend 3); o PIN
 * vira pin_mac no servidor (HMAC com ATTA_PIN_PEPPER) e nunca vai cru ao banco. */
export type EnvioDoPropass = {
  dados: { nome: string; cpf: string; whatsapp: string; conselho: Conselho; numero: string; uf: string };
  assinaturaPng: Buffer;
  pin: string;
};

/** `api.propass_submit`: 'ok' consome o link; 'recusado' é genérico (identidade), e a 5ª recusa revoga o link;
 * `sem_termo` = a clínica ainda não tem o modelo ativo (ATTA-IN-0003:authorization_template), nada gravado. */
export type DesfechoDoEnvio = { status: "ok" } | { status: "recusado" } | { status: "sem_termo" };

export type PortaPropass = {
  /** NAO_ENCONTRADO: link desconhecido, vencido (7 dias), revogado ou de vínculo excluído (a mesma resposta). */
  resolver(hashDoLink: Buffer): Promise<Resultado<ConvitePropass>>;
  /** Camada 1 — Validação ATTA (Conselho), PDD §10.4.3. NAO_ENCONTRADO: como em `resolver`. */
  conferirConselho(hashDoLink: Buffer, registro: RegistroNoConselho): Promise<Resultado<SituacaoDoConselho>>;
  /** O termo para ler antes de assinar. CONFLITO (reason authorization_template): a clínica não tem o modelo ativo. */
  termo(hashDoLink: Buffer, registro: RegistroNoConselho): Promise<Resultado<TermoDeAutorizacao>>;
  /** Envio final, tudo ou nada. NAO_ENCONTRADO: como em `resolver`. A conferência do conselho é refeita no servidor. */
  enviar(hashDoLink: Buffer, envio: EnvioDoPropass): Promise<Resultado<DesfechoDoEnvio>>;
};

export const portaPropass: PortaPropass = portaPropassSimulada;
