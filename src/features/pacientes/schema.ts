import type { FiltroDaLista } from "@/server/pacientes/porta";
import { z } from "zod";

// Bordas da lista de Pacientes (MIG-43). O termo da busca (nome ou CPF) só trafega no corpo da server action, nunca em
// rota ou query string (ADR 0001 §5).

export const cursorSchema = z.object({ nome: z.string().min(1).max(200), id: z.uuid() }).strict();

/**
 * Filtro da lista (captura 11): a lista fechada da porta, repetida aqui porque este arquivo vai ao cliente (que não
 * importa valor de src/server); o `satisfies` e o teste garantem que as duas não se separam.
 */
export const FILTROS = ["outra_clinica", "atendimento_hoje", "arquivados"] as const satisfies readonly FiltroDaLista[];
export const filtroDaListaSchema = z.enum(FILTROS);
export const buscaSchema = z.object({ termo: z.string().trim().min(2).max(100), filtro: filtroDaListaSchema.optional() }).strict();

/** A tela só busca com 2+ letras do nome ou um CPF/RNE inteiro; menos que isso volta para a lista. */
export const termoPronto = (termo: string) => {
  const t = termo.trim();
  const digitos = t.replace(/[.\-\s/]/g, "");
  return /^\d+$/.test(digitos) ? digitos.length >= 11 : t.length >= 2;
};

// --- Novo paciente (Simulador ATTA-in, capturas 15 a 18; PDD §10.1 e §16.6) -------------------------------------------
// O CPF e os dados só trafegam no corpo da server action, nunca em rota ou query string.

const digitos = (v: string) => v.replace(/\D/g, "");

export const cpfDaBuscaSchema = z.object({ cpf: z.string().transform(digitos).pipe(z.string().length(11)) }).strict();

/** "dd/mm/aaaa" → "aaaa-mm-dd"; data válida, não futura, a partir de 1900 ("Data válida, não futura."). */
export function nascimentoIso(texto: string, hoje = new Date()): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto.trim());
  if (!m) return null;
  const [, dd, mm, aaaa] = m;
  const iso = `${aaaa}-${mm}-${dd}`;
  const data = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== iso) return null;
  if (Number(aaaa) < 1900 || data.getTime() > hoje.getTime()) return null;
  return iso;
}

/** Celular com DDD: 10 ou 11 dígitos e DDD de 11 a 99 ("Com DDD."). */
export const celularComDdd = (v: string) => {
  const d = digitos(v);
  return (d.length === 10 || d.length === 11) && Number(d.slice(0, 2)) >= 11;
};

export const cadastroSchema = z
  .object({
    documento: z.discriminatedUnion("tipo", [
      z.object({ tipo: z.literal("cpf"), numero: z.string().transform(digitos).pipe(z.string().length(11)) }),
      z.object({ tipo: z.literal("estrangeiro"), especie: z.enum(["rne", "rnm"]), numero: z.string().trim().min(3).max(20) }),
    ]),
    // "Nome e sobrenome."
    nomeCivil: z.string().trim().min(2).max(200).refine((v) => v.split(/\s+/).length >= 2),
    nomeSocial: z.string().trim().max(200).transform((v) => v || null).pipe(z.string().min(2).nullable()),
    nascimento: z.string().transform((v, ctx) => {
      const iso = nascimentoIso(v);
      if (!iso) ctx.addIssue({ code: "custom", message: "data" });
      return iso ?? "";
    }),
    celular: z.string().refine(celularComDdd).transform(digitos),
    email: z.string().trim().max(200).transform((v) => v || null).pipe(z.email().nullable()),
  })
  .strict();
export type EntradaDoCadastro = z.input<typeof cadastroSchema>;
