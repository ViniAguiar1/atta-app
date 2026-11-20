import "server-only";
/**
 * Catálogo fechado de modelos de mensagem.
 *
 * É a trava da RN-NOT-01 ("nenhuma notificação contém dado de saúde"): não existe texto livre.
 * Cada variável tem um tipo com validação; serviço, procedimento ou motivo não cabem em nenhum tipo.
 * Os textos são RASCUNHO: o texto final é da PO, e os de WhatsApp passam pela aprovação da Meta.
 */
import { falha, ok, type Resultado } from "../comum/resultado";
import type { Canal, Finalidade, MensagemRenderizada, NovoEnvio } from "./tipos";

type TipoVariavel =
  "codigo" | "url" | "nome_clinica" | "primeiro_nome" | "data_hora" | "evento_equipe" | "valor" | "data" | "numero";

/** Eventos de Configurações › Notificações (10.4.6), com o rótulo que vai na mensagem. */
export const EVENTOS_EQUIPE = {
  checkin_iniciado: "Paciente iniciou o check-in",
  checkin_concluido: "Check-in concluído",
  documento_assinado: "Documento assinado",
  paciente_atrasado: "Paciente atrasado",
  atendimento_sem_documento: "Atendimento sem documento vinculado",
  modelo_criado: "Novo modelo de documento criado",
  documento_a_vencer: "Documento prestes a vencer",
  documentos_do_servico_atualizados: "Documentos vinculados a um serviço atualizados",
  membro_convidado: "Novo membro de equipe convidado",
  limite_documentos: "Limite de documentos atingido (90%)",
} as const;

interface Modelo {
  readonly finalidade: Finalidade;
  readonly canais: readonly Canal[];
  /** Essencial = nunca suprimível por preferência (RN-NOT-02). */
  readonly essencial: boolean;
  readonly variaveis: readonly (readonly [nome: string, tipo: TipoVariavel])[];
  readonly whatsapp?: { readonly modelo: string; readonly categoria: "authentication" | "utility" };
  readonly assunto?: string;
  /** `{nome}` é trocado pelo valor validado. */
  readonly texto: string;
}

export const MODELOS = {
  codigo_verificacao: {
    finalidade: "codigo_verificacao",
    canais: ["whatsapp", "sms"],
    essencial: true,
    variaveis: [["codigo", "codigo"]],
    whatsapp: { modelo: "atta_codigo_verificacao", categoria: "authentication" },
    texto: "ATTA: seu código de check-in é {codigo}. Vale por 10 minutos. Não compartilhe.",
  },
  link_checkin: {
    finalidade: "link_checkin",
    canais: ["whatsapp", "sms"],
    essencial: true,
    variaveis: [
      ["nome_clinica", "nome_clinica"],
      ["data_hora", "data_hora"],
      ["link", "url"],
    ],
    whatsapp: { modelo: "atta_link_checkin", categoria: "utility" },
    texto: "{nome_clinica}: faça seu check-in para o atendimento de {data_hora}: {link}",
  },
  lembrete_checkin: {
    finalidade: "lembrete_checkin",
    canais: ["whatsapp", "sms"],
    essencial: true,
    variaveis: [
      ["nome_clinica", "nome_clinica"],
      ["data_hora", "data_hora"],
      ["link", "url"],
    ],
    whatsapp: { modelo: "atta_lembrete_checkin", categoria: "utility" },
    texto: "{nome_clinica}: seu check-in para {data_hora} ainda não foi feito. Sem ele não é possível atender: {link}",
  },
  link_termos: {
    finalidade: "link_termos",
    canais: ["whatsapp", "sms"],
    essencial: true,
    variaveis: [
      ["nome_clinica", "nome_clinica"],
      ["link", "url"],
    ],
    whatsapp: { modelo: "atta_link_termos", categoria: "utility" },
    texto: "{nome_clinica}: há termos do seu atendimento aguardando a sua assinatura: {link}",
  },
  link_boarding_check: {
    finalidade: "link_boarding_check",
    canais: ["whatsapp", "sms"],
    essencial: true,
    variaveis: [
      ["nome_clinica", "nome_clinica"],
      ["data_hora", "data_hora"],
      ["link", "url"],
    ],
    whatsapp: { modelo: "atta_link_boarding_check", categoria: "utility" },
    texto: "{nome_clinica}: o atendimento de {data_hora} está pronto para você: {link}",
  },
  confirmacao_agendamento: {
    finalidade: "confirmacao_agendamento",
    canais: ["whatsapp", "sms"],
    essencial: true,
    variaveis: [
      ["nome_clinica", "nome_clinica"],
      ["data_hora", "data_hora"],
    ],
    whatsapp: { modelo: "atta_confirmacao_agendamento", categoria: "utility" },
    texto: "{nome_clinica}: seu atendimento está confirmado para {data_hora}.",
  },
  alerta_equipe: {
    finalidade: "alerta_equipe",
    canais: ["email", "whatsapp"],
    essencial: false,
    variaveis: [
      ["evento", "evento_equipe"],
      ["data_hora", "data_hora"],
      ["link", "url"],
    ],
    whatsapp: { modelo: "atta_alerta_equipe", categoria: "utility" },
    assunto: "ATTA: {evento}",
    texto: "{evento} em {data_hora}. Veja no painel: {link}",
  },
  aviso_cobranca: {
    finalidade: "aviso_cobranca",
    canais: ["email"],
    essencial: true,
    variaveis: [
      ["valor", "valor"],
      ["vencimento", "data"],
      ["dias", "numero"],
      ["link", "url"],
    ],
    assunto: "ATTA: mensalidade em aberto",
    texto: "A mensalidade de {valor}, vencida em {vencimento}, está em aberto há {dias} dias. Para regularizar: {link}",
  },
  relatorio_importacao: {
    finalidade: "relatorio_importacao",
    canais: ["email", "whatsapp"],
    essencial: true,
    variaveis: [
      ["linhas", "numero"],
      ["link", "url"],
    ],
    whatsapp: { modelo: "atta_relatorio_importacao", categoria: "utility" },
    assunto: "ATTA: importação com linhas a corrigir",
    texto: "A importação de pacientes tem {linhas} linhas a corrigir. Veja quais: {link}",
  },
  documentos_assinados: {
    finalidade: "documentos_assinados",
    canais: ["email"],
    essencial: true,
    variaveis: [["nome_clinica", "nome_clinica"]],
    assunto: "{nome_clinica}: seus documentos assinados",
    texto: "Conforme pedido na recepção, seguem em anexo os documentos assinados no seu atendimento em {nome_clinica}.",
  },
  convite_equipe: {
    finalidade: "convite_equipe",
    canais: ["email"],
    essencial: true,
    variaveis: [
      ["nome_clinica", "nome_clinica"],
      ["link", "url"],
    ],
    assunto: "Convite para a equipe de {nome_clinica} no ATTA",
    texto: "Você foi convidado para a equipe de {nome_clinica} no ATTA. Para aceitar: {link}",
  },
} as const satisfies Record<string, Modelo>;

export type IdModelo = keyof typeof MODELOS;

export function ehModelo(id: string): id is IdModelo {
  return Object.hasOwn(MODELOS, id);
}

export interface OpcoesRender {
  /** Hosts aceitos em variáveis `url` (os do próprio ATTA). Ex.: `['attahub.com.br', 'localhost']`. */
  readonly hostsPermitidos: readonly string[];
}

function validarVariavel(tipo: TipoVariavel, valor: string, opcoes: OpcoesRender): boolean {
  switch (tipo) {
    case "codigo":
      return /^\d{6}$/.test(valor);
    case "numero":
      return /^\d{1,7}$/.test(valor);
    case "data":
      return /^\d{2}\/\d{2}\/\d{4}$/.test(valor);
    case "data_hora":
      return /^\d{2}\/\d{2}( às \d{2}:\d{2})?$/.test(valor);
    case "valor":
      return /^R\$ \d{1,3}(\.\d{3})*,\d{2}$/.test(valor);
    case "primeiro_nome":
      return /^[\p{L}'-]{1,30}$/u.test(valor);
    case "nome_clinica":
      return valor.length >= 2 && valor.length <= 60 && !/[<>{}\n]/.test(valor) && !/https?:/i.test(valor);
    case "evento_equipe":
      return (Object.values(EVENTOS_EQUIPE) as string[]).includes(valor);
    case "url": {
      let url: URL;
      try {
        url = new URL(valor);
      } catch {
        return false;
      }
      const hostOk = opcoes.hostsPermitidos.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
      const protocoloOk = url.protocol === "https:" || url.hostname === "localhost";
      // RN-AGN-CONV-04: nenhum dado pessoal em URL; o link carrega só um identificador opaco.
      return hostOk && protocoloOk && url.search === "" && url.username === "" && valor.length <= 200;
    }
  }
}

const escaparHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Valida o pedido contra o catálogo e devolve a mensagem pronta para o provedor. */
export function renderizar(
  envio: Pick<NovoEnvio, "canal" | "finalidade" | "modelo" | "variaveis" | "destinatario" | "chaveIdempotencia">,
  opcoes: OpcoesRender,
): Resultado<MensagemRenderizada> {
  if (!ehModelo(envio.modelo)) return falha("permanente", "modelo_desconhecido", "modelo fora do catálogo");
  const modelo: Modelo = MODELOS[envio.modelo];
  if (modelo.finalidade !== envio.finalidade)
    return falha("permanente", "finalidade_divergente", "modelo não serve a esta finalidade");
  if (!modelo.canais.includes(envio.canal))
    return falha("permanente", "canal_nao_suportado", "modelo não existe neste canal");
  const esperadoTipo = envio.canal === "email" ? "email" : "telefone";
  if (envio.destinatario.tipo !== esperadoTipo)
    return falha("permanente", "destinatario_invalido", "destinatário não combina com o canal");

  const nomes = modelo.variaveis.map(([n]) => n);
  const extras = Object.keys(envio.variaveis).filter((n) => !nomes.includes(n));
  if (extras.length > 0)
    return falha("permanente", "variavel_nao_permitida", `variáveis fora do modelo: ${extras.join(", ")}`);

  const valores: string[] = [];
  for (const [nome, tipo] of modelo.variaveis) {
    const valor = envio.variaveis[nome];
    if (valor === undefined || !validarVariavel(tipo, valor, opcoes)) {
      return falha("permanente", "variavel_invalida", `variável inválida: ${nome}`);
    }
    valores.push(valor);
  }

  const preencher = (molde: string, escapar = false) =>
    molde.replace(/\{(\w+)\}/g, (_, n: string) => {
      const v = envio.variaveis[n] ?? "";
      return escapar ? escaparHtml(v) : v;
    });

  const base = { canal: envio.canal, para: envio.destinatario.endereco, chaveIdempotencia: envio.chaveIdempotencia };
  if (envio.canal === "whatsapp") {
    if (!modelo.whatsapp) return falha("permanente", "canal_nao_suportado", "modelo sem versão WhatsApp");
    return ok({
      ...base,
      whatsapp: {
        modelo: modelo.whatsapp.modelo,
        idioma: "pt_BR",
        categoria: modelo.whatsapp.categoria,
        parametros: valores,
        ...(modelo.whatsapp.categoria === "authentication" ? { codigoNoBotao: valores[0] } : {}),
      },
    });
  }
  if (envio.canal === "sms") return ok({ ...base, texto: preencher(modelo.texto) });
  return ok({
    ...base,
    assunto: preencher(modelo.assunto ?? "ATTA"),
    texto: preencher(modelo.texto),
    html: `<p>${preencher(modelo.texto, true)}</p>`,
  });
}

export function modeloEhEssencial(id: string): boolean {
  return ehModelo(id) && MODELOS[id].essencial;
}
