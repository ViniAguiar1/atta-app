import "server-only";
import type { FalhaProvedor } from "../comum/resultado-provedor";

export type Canal = "whatsapp" | "sms" | "email";

/** Para que serve o envio. Define se é essencial (RN-NOT-02) e qual modelo pode ser usado. */
export type Finalidade =
  | "codigo_verificacao" // código do check-in web (RN-AGN-CONV-03)
  | "link_checkin" // Link Check-in Online (RN-AGN-CONV-01)
  | "lembrete_checkin" // lembretes 1h e 30min
  | "link_termos" // termos pendentes enviados pelo Boarding Check (10.2.3)
  | "link_boarding_check" // link do profissional (13.4)
  | "confirmacao_agendamento" // confirmação manual da recepção (21)
  | "alerta_equipe" // eventos de Configurações › Notificações (10.4.6)
  | "resumo_equipe" // resumo diário/semanal (10.4.6)
  | "convite_equipe"
  | "aviso_cobranca" // régua de inadimplência (10.4.8)
  | "relatorio_importacao" // inconsistências da importação (10.1)
  | "documentos_assinados"; // envio sob pedido pela recepção (11.13)

export type EstadoEnvio =
  | "pendente"
  | "enviando"
  | "enviado" // aceito pelo provedor
  | "entregue"
  | "lido"
  | "falhou"
  | "cancelado"
  | "expirado";

export const ESTADOS_FINAIS: ReadonlySet<EstadoEnvio> = new Set([
  "entregue",
  "lido",
  "falhou",
  "cancelado",
  "expirado",
]);

/** Ordem para aplicar retorno de entrega sem regredir (webhook fora de ordem). */
export const ORDEM_ESTADO: Readonly<Record<EstadoEnvio, number>> = {
  pendente: 0,
  enviando: 1,
  enviado: 2,
  entregue: 3,
  lido: 4,
  falhou: 5,
  cancelado: 5,
  expirado: 5,
};

/**
 * Quem recebe, por referência (ADR 0005 §1): a fila resolve e decifra o contato no servidor. `provisional_patient`
 * é o importado com CPF novo antes do primeiro check-in (contato em network.person_import_provisional, mesmo tenant). O único caso com
 * endereço cru é o convite de equipe para um e-mail que ainda não está no sistema (`convite_equipe`).
 */
export type ReferenciaDestinatario =
  | { readonly tipo: "person" | "provisional_patient" | "professional" | "membership"; readonly id: string }
  | { readonly tipo: "email_novo"; readonly endereco: string };

/** Endereço já resolvido (telefone em E.164 ou e-mail). Só em memória: nunca vai para log; na tela, mascarado. */
export interface Endereco {
  readonly tipo: "telefone" | "email";
  readonly valor: string;
}

/** Referência ao que originou o envio (agendamento, link, fatura...). Sem dado pessoal. */
export interface Referencia {
  readonly tipo: string;
  readonly id: string;
}

export interface NovoEnvio {
  readonly tenantId: string;
  readonly canal: Canal;
  readonly finalidade: Finalidade;
  readonly destinatario: ReferenciaDestinatario;
  readonly modelo: string; // id do catálogo em modelos.ts
  readonly variaveis: Readonly<Record<string, string>>;
  /** Única por tenant: repetir o pedido não duplica o envio (PDD 9.6). */
  readonly chaveIdempotencia: string;
  readonly prioridade: "imediata" | "normal";
  /** Depois disso o envio perde o sentido (ex.: código vale 10 min) e expira. */
  readonly validoAte?: Date;
  /** Não enviar antes disso (pausa noturna, lembretes agendados). */
  readonly agendadoPara?: Date;
  readonly referencia?: Referencia;
  /** Canais seguintes se este falhar de vez, ex.: WhatsApp → SMS (10.2.1). */
  readonly alternativas?: readonly Canal[];
  /** Quem pediu (usuário interno) ou `sistema`. Vai para o histórico de envios. */
  readonly autor: string;
}

export interface Envio extends NovoEnvio {
  readonly id: string;
  readonly estado: EstadoEnvio;
  readonly tentativas: number;
  readonly proximaTentativaEm: Date;
  readonly idExterno?: string;
  readonly ultimaFalha?: Pick<FalhaProvedor, "tipo" | "codigo">;
  readonly envioOrigemId?: string; // preenchido no envio alternativo
  readonly criadoEm: Date;
  readonly atualizadoEm: Date;
}

/** Retorno de entrega vindo do provedor (webhook) já traduzido. */
export interface RetornoEntrega {
  readonly canal: Canal;
  readonly idExterno: string;
  readonly estado: Extract<EstadoEnvio, "enviado" | "entregue" | "lido" | "falhou">;
  readonly quando: Date;
  readonly codigoFalha?: string;
  /** Mensagem cobrável (WhatsApp cobra por entregue, 10.4.6 / LAC-047). */
  readonly cobravel?: boolean;
}

/** Mensagem pronta para o provedor: modelo já validado e renderizado. */
export interface MensagemRenderizada {
  readonly canal: Canal;
  readonly para: string;
  readonly chaveIdempotencia: string;
  /** WhatsApp: modelo aprovado na Meta e parâmetros posicionais. */
  readonly whatsapp?: {
    readonly modelo: string;
    readonly idioma: "pt_BR";
    readonly categoria: "authentication" | "utility";
    readonly parametros: readonly string[];
    /** Modelos de autenticação: o código vai também no botão "copiar código". */
    readonly codigoNoBotao?: string;
  };
  readonly texto?: string; // SMS e versão texto do e-mail
  readonly assunto?: string;
  readonly html?: string;
  readonly anexos?: readonly { readonly nome: string; readonly tipo: string; readonly conteudoBase64: string }[];
}
