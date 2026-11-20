import "server-only";
import { cookies } from "next/headers";

// Sessão do paciente na simulação, no lugar do grant do MIG-13a (ADR 0004): depois do código, o desafio (uuid opaco,
// sem dado pessoal) vai num cookie HttpOnly e é lido pelas portas simuladas do cadastro. A porta real troca isto pelo
// cookie atta_grant de src/server/grant/politica.ts. Mesmos atributos da ADR: HttpOnly, Secure, SameSite=Lax, sem Domain.
const NOME = "atta_grant";
const VALIDADE_S = 30 * 60; // 30 min sem uso (ADR 0004)

export async function gravarSessaoSimulada(desafio: string) {
  (await cookies()).set(NOME, desafio, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: VALIDADE_S });
}

export async function lerSessaoSimulada(): Promise<string | null> {
  return (await cookies()).get(NOME)?.value ?? null;
}
