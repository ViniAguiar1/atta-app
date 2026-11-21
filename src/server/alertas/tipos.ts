// Tipos de Configurações › Notificações (PDD v206 §10.4.6): os canais externos de alerta da equipe, os eventos que
// chegam por eles e os filtros de silêncio. Sem "server-only": a tela (client) usa os mesmos tipos e as mesmas listas.
// Os 10 eventos e as 3 categorias são os do PDD (decisão do CTO, 21/11; os outros 26 do simulador foram à PO, R33).

export const CATEGORIAS = ["checkin", "documentos", "sistema"] as const;
export type CategoriaDeEvento = (typeof CATEGORIAS)[number];

export const EVENTOS = [
  { chave: "checkin_iniciado", categoria: "checkin" },
  { chave: "checkin_concluido", categoria: "checkin" },
  { chave: "documento_assinado", categoria: "checkin" },
  { chave: "paciente_atrasado", categoria: "checkin" },
  { chave: "atendimento_sem_documento", categoria: "checkin" },
  { chave: "modelo_criado", categoria: "documentos" },
  { chave: "documento_a_vencer", categoria: "documentos" },
  { chave: "documentos_do_procedimento_atualizados", categoria: "documentos" },
  { chave: "membro_convidado", categoria: "sistema" },
  { chave: "limite_de_documentos", categoria: "sistema" },
] as const satisfies readonly { chave: string; categoria: CategoriaDeEvento }[];
export type ChaveDeEvento = (typeof EVENTOS)[number]["chave"];

export const CANAIS = ["email", "whatsapp"] as const;
export type Canal = (typeof CANAIS)[number];

export const FREQUENCIAS = ["tempo_real", "diario", "semanal"] as const;
export type FrequenciaDoResumo = (typeof FREQUENCIAS)[number];

export type AlertasDaEquipe = {
  /** o e-mail e o número da equipe são dado pessoal: a leitura devolve só mascarado (Tech Lead, 21/11; ADR 0002 §6) */
  email: { ativo: boolean; destinoMascarado: string | null };
  whatsapp: { ativo: boolean; destinoMascarado: string | null };
  eventos: { chave: ChaveDeEvento; email: boolean; whatsapp: boolean }[];
  filtros: { pausaNoturna: boolean; frequenciaDoResumo: FrequenciaDoResumo };
  /** se agora está dentro da pausa noturna, no fuso da clínica (calculado no servidor); null quando não se sabe */
  emPausaNoturna: boolean | null;
};
