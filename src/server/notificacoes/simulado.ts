import "server-only";
import { ok } from "@/lib/errors";
import { caixaSchema } from "@/features/notificacoes/schema";
import type { PortaNotificacoes } from "./porta";

// Sino simulado, para a tela andar antes do MIG-15 e para a prova de pixel perfect contra a captura 41. Só dado fictício
// (nomes do Simulador ATTA-in, ninguém real) e nenhum dado de saúde (RN-NOT-01); sem dica na tela (regra do stage). As
// horas são relativas ao momento da leitura, para cair em Hoje e Ontem. Passa pelo mesmo schema que a real vai usar.
const HORA = 60 * 60 * 1000;

export const portaNotificacoesSimulada: PortaNotificacoes = {
  async caixa() {
    const agora = Date.now();
    const quando = (horas: number) => new Date(agora - horas * HORA).toISOString();
    return ok(
      caixaSchema.parse({
        itens: [
          {
            id: "6b6b0000-0000-4000-8000-000000000001",
            tipo: "agenda",
            evento: "Atendimento sem documento vinculado",
            titulo: "Atendimento sem documento vinculado",
            corpo: "Eduardo Lima, 16:30 com Dr. Caio Andrade, está sem termo vinculado.",
            em: quando(0.2),
            lida: false,
            destino: "agenda",
          },
          {
            id: "6b6b0000-0000-4000-8000-000000000002",
            tipo: "equipe",
            evento: "Novo membro de equipe convidado",
            titulo: "Convite pendente",
            corpo: "Tiago Nunes ainda não aceitou o convite enviado em 24/09.",
            em: quando(0.4),
            lida: false,
            destino: "equipe",
          },
          {
            id: "6b6b0000-0000-4000-8000-000000000003",
            tipo: "documento",
            evento: "Documento prestes a vencer",
            titulo: "Documento prestes a vencer",
            corpo: "Autorização de uso de imagem de Beatriz Nogueira vence em 12 dias (validade Única, 12 meses).",
            em: quando(26),
            lida: true,
            destino: "documentos",
          },
        ],
        canais: {
          email: { ativo: true, endereco: "recepcao@clinica.exemplo" },
          whatsapp: { ativo: false },
          pausaNoturna: { ativa: true },
          resumo: "tempo_real",
          eventos: { total: 36, comEmail: 4, comWhatsapp: 0 },
        },
      }),
    );
  },
};
