import "server-only";
import type { Resultado } from "@/lib/errors";
import type { Conselho } from "@/features/propass/schema";
import { portaPropassReal } from "./real";

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
  /** Só quando o passo 2 pediu a senha; null quando o profissional já tem uma (identidade 'usar_pin_existente'). */
  pin: string | null;
  /** "Leia até o fim": quando o termo apareceu e quando a leitura terminou (vão no pacote do ATTA Sign). */
  leitura: { abertoEm: Date; rolagemCompletaEm: Date };
  origem: Origem;
  /** Versão do Aviso de Privacidade do Profissional que ele confirmou ter lido; null enquanto o aviso está desligado (P2b). */
  avisoDePrivacidade: string | null;
};

export type Origem = { ip: string | null; userAgent: string | null };

/** Passo 2 (api.propass_identity_check, #247): sem oráculo de CPF, só "peça a senha" ou "use a que já tem". */
export type Identidade = "pedir_pin" | "usar_pin_existente";

/** `api.propass_submit`: 'ok' consome o link; 'recusado' é genérico (identidade), e a 5ª recusa revoga o link. A falta
 * do modelo do termo é guarda do banco e não deve acontecer (a ATTA publica o modelo por seed, CTO P2c): vira erro. */
export type DesfechoDoEnvio = { status: "ok"; codigoAtta: string } | { status: "recusado" };

export type PortaPropass = {
  /** NAO_ENCONTRADO: link desconhecido, vencido (7 dias), revogado ou de vínculo excluído (a mesma resposta). */
  resolver(hashDoLink: Buffer): Promise<Resultado<ConvitePropass>>;
  /** Camada 1 — Validação ATTA (Conselho), PDD §10.4.3. NAO_ENCONTRADO: como em `resolver`. */
  conferirConselho(hashDoLink: Buffer, registro: RegistroNoConselho): Promise<Resultado<SituacaoDoConselho>>;
  /** Pede ou não a senha de 4 números. LIMITE: tentativas demais por IP ou por link. */
  identidade(hashDoLink: Buffer, registro: { conselho: Conselho; uf: string; numero: string; cpf: string }, origem: Origem): Promise<Resultado<Identidade>>;
  /** O termo para ler antes de assinar (o modelo de sistema, publicado pela ATTA em toda clínica). */
  termo(hashDoLink: Buffer, registro: RegistroNoConselho): Promise<Resultado<TermoDeAutorizacao>>;
  /** Envio final, tudo ou nada. NAO_ENCONTRADO: como em `resolver`. A conferência do conselho é refeita no servidor. */
  enviar(hashDoLink: Buffer, envio: EnvioDoPropass): Promise<Resultado<DesfechoDoEnvio>>;
};

// Porta real em todo ambiente (servidor do Backend 4 e do Backend 3 na main e na nuvem). A simulada (simulado.ts) fica
// só para os testes da tela.
export const portaPropass: PortaPropass = portaPropassReal;
