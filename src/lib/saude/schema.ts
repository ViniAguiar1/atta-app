import { z } from "zod";

// Formulário de Saúde (MIG-52; PDD v206 §10.3.2, §10.3.2.1, §11.6, §11.7, RN-FSA-01 a 14). Contrato da porta combinado com
// o Tech Lead e o Backend 3 em migracao/desenho/mig-52-formulario-contrato.md: a forma aqui não muda; os nomes das funções
// em api são do Backend 3 (MIG-22). Zod na borda: a resposta do servidor e o que a tela envia passam por estes schemas.
// Nunca resposta de saúde em URL, log ou print.

const id = z.uuid();
const opcao = z.object({ id: z.string().min(1), rotulo: z.string().min(1) });

/** Tipos de pergunta do Banco de Perguntas (§10.3.2.1). */
export const tipoDePerguntaSchema = z.enum(["sim_nao", "opcoes", "aberta"]);

export const perguntaSchema = z.object({
  id,
  texto: z.string().min(1),
  tipo: tipoDePerguntaSchema,
  /** Decisão da clínica por pergunta e formulário (RN-FSA-11). */
  obrigatoria: z.boolean(),
  /** Chips do tipo "opcoes". */
  opcoes: z.array(opcao).optional(),
  /** "Outro" com texto, no tipo "opcoes". */
  permiteOutro: z.boolean().optional(),
  /** RN-FSA-07: o Sim revela uma lista de caixas, com busca e digitação. */
  subOpcoes: z.object({ quando: z.literal("sim"), opcoes: z.array(opcao), permiteDigitar: z.boolean() }).optional(),
  /** Lógica condicional: a pergunta só aparece com esta resposta anterior. */
  condicao: z.object({ perguntaId: id, resposta: z.string().min(1) }).optional(),
});

export const valorSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("sim_nao"), valor: z.boolean(), subOpcoes: z.array(z.string()).optional(), digitadas: z.array(z.string().max(120)).optional() }),
  z.object({ tipo: z.literal("opcoes"), valores: z.array(z.string()), outro: z.string().max(280).optional() }),
  z.object({ tipo: z.literal("aberta"), texto: z.string().max(2000) }),
]);

/** Resposta de uma pergunta: um valor, ou "Prefiro não responder" (RN-FSA-10). A recusa não tem valor. */
export const respostaSchema = z.discriminatedUnion("recusada", [
  z.object({ perguntaId: id, recusada: z.literal(false), valor: valorSchema }),
  z.object({ perguntaId: id, recusada: z.literal(true) }),
]);

/** "Pergunta a pergunta" (§10.3.2, §11.6): a resposta anterior do mesmo CPF, em qualquer clínica, sem o estabelecimento. */
export const respostaAnteriorSchema = z.object({
  valor: valorSchema,
  respondidaEm: z.object({ mes: z.number().int().min(1).max(12), ano: z.number().int().min(2000) }),
});

/** O que o paciente recebe para preencher (porta do paciente, carregar). */
export const formularioDoPacienteSchema = z.object({
  perguntas: z.array(perguntaSchema),
  anteriores: z.record(z.string(), respostaAnteriorSchema),
  rascunho: z.array(respostaSchema),
});

/** O que o profissional lê no Boarding Check (só leitura; RN-FSA-02, RN-FSA-14, RN-R-02). */
export const leituraDoFormularioSchema = z.object({
  perguntas: z.array(perguntaSchema),
  respostas: z.array(respostaSchema),
  /** Destaques visuais definidos pela clínica, por pergunta: sem interpretação, recomendação nem bloqueio. */
  destaques: z.record(z.string(), z.string()),
  declaradoEm: z.iso.datetime({ offset: true }).nullable(),
});

export type TipoDePergunta = z.infer<typeof tipoDePerguntaSchema>;
export type Pergunta = z.infer<typeof perguntaSchema>;
export type Valor = z.infer<typeof valorSchema>;
export type Resposta = z.infer<typeof respostaSchema>;
export type RespostaAnterior = z.infer<typeof respostaAnteriorSchema>;
export type FormularioDoPaciente = z.infer<typeof formularioDoPacienteSchema>;
export type LeituraDoFormulario = z.infer<typeof leituraDoFormularioSchema>;
