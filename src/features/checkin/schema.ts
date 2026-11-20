import { z } from "zod";

// Bordas do check-in pelo celular (MIG-50; PDD v206 §11.4). O CPF só trafega no corpo da server action, nunca em
// rota ou query string (ADR 0001 §5).

// CPF: lib comum (também usada pelo PROpass); reexportado para os imports do check-in não mudarem.
import { cpfValido, soDigitos } from "@/lib/brasil/documentos";
export { cpfValido, mascararCpf, soDigitos } from "@/lib/brasil/documentos";

/** Identificador da placa QR da clínica: opaco e não pessoal (PDD §14.2). */
export const portalSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/);

export const identificacaoSchema = z.object({
  portal: portalSchema,
  cpf: z.string().transform(soDigitos).refine(cpfValido),
});

export const codigoSchema = z.object({
  desafio: z.uuid(),
  codigo: z.string().regex(/^\d{6}$/), // 6 números (PDD §18.5)
});

export const reenvioSchema = z.object({ desafio: z.uuid() });

/** O que o check-in faz depois do código confirmado (PDD §11.4 e §11.9). */
export const SITUACOES = ["seguir", "cadastro_novo", "concluido", "cancelado", "ausente", "divergencia"] as const;
export type Situacao = (typeof SITUACOES)[number];
