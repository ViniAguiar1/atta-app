import { z } from "zod";

// Bordas do check-in pelo celular (MIG-50; PDD v206 §11.4). O CPF só trafega no corpo da server action, nunca em
// rota ou query string (ADR 0001 §5).

export const soDigitos = (valor: string) => valor.replace(/\D/g, "");

function digitoVerificador(base: string): number {
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

export function cpfValido(valor: string): boolean {
  const cpf = soDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const d1 = digitoVerificador(cpf.slice(0, 9));
  const d2 = digitoVerificador(cpf.slice(0, 9) + d1);
  return cpf.endsWith(`${d1}${d2}`);
}

/** Máscara de digitação: 000.000.000-00, aceitando colagem com ou sem pontuação. */
export function mascararCpf(valor: string): string {
  const d = soDigitos(valor).slice(0, 11);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(Boolean).join(".") + (d.length > 9 ? `-${d.slice(9)}` : "");
}

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
