import { z } from "zod";

// "Confirme Seus Dados" (MIG-51; PDD v206 §11.5) e as validações do §16.6. Validação campo a campo; campo
// obrigatório vazio ou inválido bloqueia o avanço (§14.3). Os dados vêm do servidor pelo grant do paciente (ADR 0004):
// nada disso trafega na URL.

const digitos = (v: string) => v.replace(/\D/g, "");

// DDDs válidos no Brasil (Anatel). Usado na regra "DDD válido e quantidade de dígitos" do §16.6.
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91,
  92, 93, 94, 95, 96, 97, 98, 99,
]);

export function celularValido(valor: string): boolean {
  const d = digitos(valor);
  return d.length === 11 && DDDS.has(Number(d.slice(0, 2))) && d[2] === "9";
}

export function mascararCelular(valor: string): string {
  const d = digitos(valor).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function mascararCep(valor: string): string {
  const d = digitos(valor).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** Nome: mínimo de dois termos (§16.6). */
export const nomeValido = (v: string) => v.trim().split(/\s+/).filter((p) => p.length > 1).length >= 2;

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
