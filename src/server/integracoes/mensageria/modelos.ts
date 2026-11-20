import "server-only";
import { z } from "zod";
/**
 * Catálogo fechado de modelos de mensagem.
 *
 * É a trava da RN-NOT-01 ("nenhuma notificação contém dado de saúde"): não existe texto livre.
 * Cada variável tem um tipo com validação; serviço, procedimento ou motivo não cabem em nenhum tipo.
 * Os textos são RASCUNHO: o texto final é da PO, e os de WhatsApp passam pela aprovação da Meta.
 */
import { falhaProvedor, okProvedor, type ResultadoProvedor } from "../comum/resultado-provedor";
import type { Canal, Endereco, Finalidade, MensagemRenderizada, NovoEnvio } from "./tipos";

type TipoVariavel =
  "codigo" | "url" | "nome_clinica" | "data_hora" | "evento_equipe" | "periodo" | "valor" | "data" | "numero";

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
  resumo_equipe: {
    finalidade: "resumo_equipe",
    canais: ["email", "whatsapp"],
    essencial: false,
    variaveis: [
      ["periodo", "periodo"],
      ["link", "url"],
    ],
    whatsapp: { modelo: "atta_resumo_equipe", categoria: "utility" },
    assunto: "ATTA: resumo {periodo} da operação",
    texto: "O resumo {periodo} da operação da clínica está pronto: {link}",
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
    case "periodo":
      return valor === "diário" || valor === "semanal";
    case "nome_clinica":
      // sem link nem formatação: a Meta também recusa quebra de linha, tab e 4 espaços seguidos em parâmetro
      return (
        valor.length >= 2 &&
        valor.length <= 60 &&
        !/[<>{}\r\n\t]/.test(valor) &&
        !/ {4}/.test(valor) &&
        !/https?:|www\./i.test(valor)
      );
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
      // e o fragmento também vai no texto da mensagem; 11 dígitos seguidos no caminho parecem CPF, não id opaco
      const semDado = url.search === "" && url.hash === "" && url.username === "" && url.password === "";
      return hostOk && protocoloOk && semDado && !/\d{11}/.test(url.pathname) && valor.length <= 200;
    }
  }
}

const escaparHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const uuid = z.uuid();
const emailNovo = z.email().max(254);

/**
 * Confere a referência do destinatário antes de enfileirar (ADR 0005 §1): pessoa, profissional ou membro por id;
 * endereço cru só no convite de equipe por e-mail.
 */
export function validarDestinatario(
  envio: Pick<NovoEnvio, "canal" | "modelo" | "destinatario">,
): ResultadoProvedor<void> {
  const d = envio.destinatario;
  if (d.tipo === "email_novo") {
    if (envio.modelo !== "convite_equipe" || envio.canal !== "email" || !emailNovo.safeParse(d.endereco).success)
      return falhaProvedor("permanente", "destinatario_invalido", "endereço cru só no convite de equipe por e-mail");
    return okProvedor(undefined);
  }
  return uuid.safeParse(d.id).success
    ? okProvedor(undefined)
    : falhaProvedor("permanente", "destinatario_invalido", "referência de destinatário inválida");
}

/** Valida o pedido contra o catálogo e devolve a mensagem pronta para o provedor, já com o endereço resolvido. */
export function renderizar(
  envio: Pick<NovoEnvio, "canal" | "finalidade" | "modelo" | "variaveis" | "chaveIdempotencia">,
  para: Endereco,
  opcoes: OpcoesRender,
): ResultadoProvedor<MensagemRenderizada> {
  if (!ehModelo(envio.modelo)) return falhaProvedor("permanente", "modelo_desconhecido", "modelo fora do catálogo");
  const modelo: Modelo = MODELOS[envio.modelo];
  if (modelo.finalidade !== envio.finalidade)
    return falhaProvedor("permanente", "finalidade_divergente", "modelo não serve a esta finalidade");
  if (!modelo.canais.includes(envio.canal))
    return falhaProvedor("permanente", "canal_nao_suportado", "modelo não existe neste canal");
  const esperadoTipo = envio.canal === "email" ? "email" : "telefone";
  if (para.tipo !== esperadoTipo)
    return falhaProvedor("permanente", "destinatario_invalido", "destinatário não combina com o canal");

  const nomes = modelo.variaveis.map(([n]) => n);
  const extras = Object.keys(envio.variaveis).filter((n) => !nomes.includes(n));
  if (extras.length > 0)
    return falhaProvedor("permanente", "variavel_nao_permitida", `variáveis fora do modelo: ${extras.join(", ")}`);

  const valores: string[] = [];
  for (const [nome, tipo] of modelo.variaveis) {
    const valor = envio.variaveis[nome];
    if (valor === undefined || !validarVariavel(tipo, valor, opcoes)) {
      return falhaProvedor("permanente", "variavel_invalida", `variável inválida: ${nome}`);
    }
    valores.push(valor);
  }

  const preencher = (molde: string, escapar = false) =>
    molde.replace(/\{(\w+)\}/g, (_, n: string) => {
      const v = envio.variaveis[n] ?? "";
      return escapar ? escaparHtml(v) : v;
    });

  const base = { canal: envio.canal, para: para.valor, chaveIdempotencia: envio.chaveIdempotencia };
  if (envio.canal === "whatsapp") {
    if (!modelo.whatsapp) return falhaProvedor("permanente", "canal_nao_suportado", "modelo sem versão WhatsApp");
    return okProvedor({
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
  if (envio.canal === "sms") return okProvedor({ ...base, texto: preencher(modelo.texto) });
  return okProvedor({
    ...base,
    assunto: preencher(modelo.assunto ?? "ATTA"),
    texto: preencher(modelo.texto),
    html: `<p>${preencher(modelo.texto, true)}</p>`,
  });
}

export function modeloEhEssencial(id: string): boolean {
  return ehModelo(id) && MODELOS[id].essencial;
}
