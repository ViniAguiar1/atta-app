import "server-only";
/**
 * Simulador de provedor de mensagens, para desenvolvimento, testes e a prévia da Vercel sem chave.
 *
 * Cenários pelo destinatário (só dados fictícios):
 * - telefone terminado em 0000 / e-mail que começa com `falha@`: falha permanente;
 * - telefone terminado em 9999 / e-mail que começa com `instavel@`: falha transitória;
 * - telefone terminado em 8888: aceito, mas o retorno de entrega chega como `falhou` (testa o SMS alternativo);
 * - o resto: aceito e entregue.
 * A caixa de saída guarda o que "saiu", para a tela de desenvolvimento mostrar o código do check-in.
 */
import { randomUUID } from "node:crypto";
import { falhaProvedor, okProvedor, type ResultadoProvedor } from "../comum/resultado-provedor";
import type { ProvedorMensagem, RequisicaoWebhook } from "./porta";
import type { Canal, MensagemRenderizada, RetornoEntrega } from "./tipos";

export interface ItemCaixaDeSaida {
  readonly idExterno: string;
  readonly mensagem: MensagemRenderizada;
  readonly enviadoEm: Date;
}

export class SimuladorMensageria implements ProvedorMensagem {
  readonly nome: string;
  readonly caixaDeSaida: ItemCaixaDeSaida[] = [];
  private readonly porChave = new Map<string, string>();

  constructor(
    readonly canal: Canal,
    private readonly agora: () => Date = () => new Date(),
  ) {
    this.nome = `simulador-${canal}`;
  }

  async enviar(mensagem: MensagemRenderizada): Promise<ResultadoProvedor<{ idExterno: string }>> {
    const repetido = this.porChave.get(mensagem.chaveIdempotencia);
    if (repetido) return okProvedor({ idExterno: repetido });

    const para = mensagem.para;
    if (para.endsWith("0000") || para.startsWith("falha@"))
      return falhaProvedor("permanente", "sim_destino_invalido", "simulador: destino recusado");
    if (para.endsWith("9999") || para.startsWith("instavel@"))
      return falhaProvedor("transitoria", "sim_indisponivel", "simulador: provedor indisponível");

    const idExterno = `sim_${randomUUID()}`;
    this.porChave.set(mensagem.chaveIdempotencia, idExterno);
    this.caixaDeSaida.push({ idExterno, mensagem, enviadoEm: this.agora() });
    return okProvedor({ idExterno });
  }

  /** Gera os retornos de entrega que o provedor real mandaria por webhook. */
  retornosPendentes(): RetornoEntrega[] {
    return this.caixaDeSaida.map(({ idExterno, mensagem }) => ({
      canal: this.canal,
      idExterno,
      estado: mensagem.para.endsWith("8888") ? "falhou" : "entregue",
      quando: this.agora(),
      ...(mensagem.para.endsWith("8888") ? { codigoFalha: "sim_nao_entregue" } : {}),
      cobravel: this.canal !== "email" && !mensagem.para.endsWith("8888"),
    }));
  }

  /** O simulador aceita webhook em JSON simples `{retornos: [...]}`, sem assinatura (só fora de produção). */
  interpretarRetorno(requisicao: RequisicaoWebhook): ResultadoProvedor<readonly RetornoEntrega[]> {
    try {
      const dados = JSON.parse(requisicao.corpo) as {
        retornos?: (Omit<RetornoEntrega, "quando"> & { quando: string })[];
      };
      return okProvedor((dados.retornos ?? []).map((r) => ({ ...r, quando: new Date(r.quando) })));
    } catch {
      return falhaProvedor("permanente", "corpo_invalido", "simulador: corpo inválido");
    }
  }

  /** Último código enviado a um número (tela de desenvolvimento e testes E2E). */
  ultimoCodigoPara(telefone: string): string | undefined {
    const item = [...this.caixaDeSaida]
      .reverse()
      .find((i) => i.mensagem.para === telefone && i.mensagem.whatsapp?.codigoNoBotao);
    return item?.mensagem.whatsapp?.codigoNoBotao ?? undefined;
  }
}
