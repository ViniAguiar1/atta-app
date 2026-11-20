import { z } from "zod";
import { celularValido, cpfValido, nomeValido, soDigitos } from "@/lib/brasil/documentos";

// Bordas do PROpass (MIG-55; PDD v206 §10.4.3). O profissional preenche tudo; a clínica só deu o e-mail (decisão do
// dono, 20/11). CPF e WhatsApp só no corpo da server action, nunca na URL.

/** Lista única de conselhos aceitos (PDD §10.4.3), com os valores do `p_council` do Backend 4. */
export const CONSELHOS = ["crm", "cro", "crbm", "coren", "crefito", "crn", "cfp", "esteticista_ou_equivalente"] as const;
export type Conselho = (typeof CONSELHOS)[number];

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export const dadosSchema = z.object({
  nome: z.string().trim().refine(nomeValido),
  cpf: z.string().transform(soDigitos).refine(cpfValido),
  whatsapp: z.string().transform(soDigitos).refine(celularValido),
  conselho: z.enum(CONSELHOS),
  numero: z.string().transform(soDigitos).pipe(z.string().regex(/^\d{1,10}$/)),
  uf: z.enum(UFS),
});

export type CampoDosDados = keyof z.input<typeof dadosSchema>;
export type DadosDoProfissional = z.input<typeof dadosSchema>;

/** O que a tela recebe ao conferir o conselho. Só a situação: CPF e WhatsApp não voltam. */
export type ConferenciaDoConselho =
  | { situacao: "regularizado"; consultadoEm: string }
  | { situacao: "nao_confere" }
  | { situacao: "link_sem_validade" };
