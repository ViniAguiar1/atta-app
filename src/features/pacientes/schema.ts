import { z } from "zod";

// Bordas da lista de Pacientes (MIG-43). O termo da busca (nome ou CPF) só trafega no corpo da server action, nunca em
// rota ou query string (ADR 0001 §5).

export const cursorSchema = z.object({ nome: z.string().min(1).max(200), id: z.uuid() }).strict();

export const buscaSchema = z.object({ termo: z.string().trim().min(2).max(100) }).strict();

/** A tela só busca com 2+ letras do nome ou um CPF/RNE inteiro; menos que isso volta para a lista. */
export const termoPronto = (termo: string) => {
  const t = termo.trim();
  const digitos = t.replace(/[.\-\s/]/g, "");
  return /^\d+$/.test(digitos) ? digitos.length >= 11 : t.length >= 2;
};
