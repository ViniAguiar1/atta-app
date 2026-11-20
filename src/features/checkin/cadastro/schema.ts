import { z } from "zod";

// "Confirme Seus Dados" (MIG-51; PDD v206 §11.5) e as validações do §16.6. Validação campo a campo; campo
// obrigatório vazio ou inválido bloqueia o avanço (§14.3). Os dados vêm do servidor pelo grant do paciente (ADR 0004):
// nada disso trafega na URL.

const digitos = (v: string) => v.replace(/\D/g, "");

// Celular: lib comum (também usada pelo PROpass); reexportado para os imports do cadastro não mudarem.
import { celularValido, nomeValido } from "@/lib/brasil/documentos";
export { celularValido, mascararCelular, nomeValido } from "@/lib/brasil/documentos";

export function mascararCep(valor: string): string {
  const d = digitos(valor).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}


export const dadosSchema = z
  .object({
    nome: z.string().trim().refine(nomeValido),
    nomeSocial: z.string().trim().max(120).optional(),
    celular: z.string().transform(digitos).refine(celularValido),
    // §16.6: e-mail não bloqueia o avanço quando há telefone (e o celular é obrigatório)
    email: z.union([z.literal(""), z.email()]),
    cep: z.string().transform(digitos).refine((v) => v.length === 8),
    logradouro: z.string().trim().min(1),
    numero: z.string().trim().min(1).max(10),
    complemento: z.string().trim().max(60),
    bairro: z.string().trim().min(1),
    cidade: z.string().trim().min(1),
    uf: z.string().regex(/^[A-Z]{2}$/),
  })
  .strict();

export type DadosEditaveis = z.input<typeof dadosSchema>;

/** O que a tela recebe: o editável, mais o que não se edita aqui (CPF mascarado e convênio da lista, LAC-048). */
export type DadosDoPaciente = DadosEditaveis & { cpfMascarado: string; convenio: { operadora: string; carteirinha: string } | null };

export type CampoEditavel = keyof DadosEditaveis;

const emailValido = (v: string) => z.email().safeParse(v.trim()).success;

/**
 * §16.6: e-mail inválido "Não [bloqueia], se houver telefone". Com celular válido, o e-mail mal formado não vai ao
 * servidor (sai vazio) e a tela só avisa; sem celular válido, bloqueia como os outros campos.
 */
export function prepararEnvio(dados: DadosEditaveis): { enviar: DadosEditaveis; emailIgnorado: boolean } {
  const ignorar = dados.email.trim() !== "" && !emailValido(dados.email) && celularValido(dados.celular);
  return { enviar: ignorar ? { ...dados, email: "" } : dados, emailIgnorado: ignorar };
}

/** Campos que bloqueiam o avanço (§16.6) e ainda estão vazios ou inválidos. */
export function camposPendentes(dados: DadosEditaveis): CampoEditavel[] {
  const r = dadosSchema.safeParse(dados);
  if (r.success) return [];
  return [...new Set(r.error.issues.map((i) => String(i.path[0]) as CampoEditavel))];
}
