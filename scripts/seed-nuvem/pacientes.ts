import type { Cofre } from "@/server/cofre";
import { cpfHmacWith, isValidCpf, maskCpf } from "@/server/crypto/cpf";
import { columnAad, seal } from "@/server/crypto/envelope";

// Pacientes FICTÍCIOS do stage (pedido do dono pelo CTO, 20/11): CPFs gerados (dígito verificador válido, ninguém real),
// nomes e contatos inventados (celular fictício, e-mail @exemplo.test), nenhum dado de saúde. Só a lógica: as chaves
// vêm do ambiente na hora de rodar (rodar.ts) e nunca ficam no repositório.
// Envelope pela ADR 0002 §6 (o mesmo do selarContato): uma DEK por pessoa, contexto ('', network.person, 'dek', id), e
// cada valor com columnAad('', network.person, coluna, id). O cpf_hmac usa o pepper do CPF (cpfHmacWith).

export type PacienteFicticio = {
  id: string;
  nome: string;
  nomeSocial?: string;
  nascimento?: string; // AAAA-MM-DD
  cpfBase?: string; // 9 dígitos; o DV é calculado (sem CPF = cadastro incompleto)
  celular?: string; // 11 dígitos
  email?: string;
};

const id = (n: number) => `0a770000-0000-4000-8000-${(10100 + n).toString().padStart(12, "0")}`;

export const PACIENTES: readonly PacienteFicticio[] = [
  { id: id(1), nome: "Larissa Tavares Monteiro", nascimento: "1991-03-14", cpfBase: "401227180", celular: "11990010001", email: "larissa.tavares@exemplo.test" },
  { id: id(2), nome: "Bruno Henrique Saldanha", nascimento: "1985-07-02", cpfBase: "317648025", celular: "11990010002", email: "bruno.saldanha@exemplo.test" },
  { id: id(3), nome: "Patrícia Lemos Arantes", nascimento: "1978-11-23", cpfBase: "528904713", celular: "11990010003" },
  { id: id(4), nome: "Diego Fontoura Ribas", nascimento: "1999-01-30", cpfBase: "634215098", email: "diego.ribas@exemplo.test" },
  { id: id(5), nome: "Juliana Prates Coutinho", nascimento: "1988-05-17", cpfBase: "745306182", celular: "11990010005", email: "juliana.prates@exemplo.test" },
  { id: id(6), nome: "Rogério Albuquerque Viana", nascimento: "1969-09-08", cpfBase: "856417290", celular: "11990010006" },
  { id: id(7), nome: "Camila Rezende Antunes", nomeSocial: "Cami Rezende", nascimento: "1995-12-04", cpfBase: "967528301", celular: "11990010007", email: "cami.rezende@exemplo.test" },
  { id: id(8), nome: "Thiago Bernardes Lacerda", nascimento: "1982-04-26", cpfBase: "178639412", celular: "11990010008", email: "thiago.lacerda@exemplo.test" },
  { id: id(9), nome: "Fernanda Quintela Rocha", nascimento: "1993-08-19", cpfBase: "289740523", email: "fernanda.quintela@exemplo.test" },
  { id: id(10), nome: "Marcelo Duarte Paiva", nascimento: "1975-02-11", cpfBase: "390851634", celular: "11990010010" },
  { id: id(11), nome: "Beatriz Nogueira Salles", nomeSocial: "Bia Salles", nascimento: "2001-06-29", cpfBase: "412962745", celular: "11990010011", email: "bia.salles@exemplo.test" },
  { id: id(12), nome: "Gustavo Peixoto Andrade", nascimento: "1987-10-05", cpfBase: "523073856", celular: "11990010012", email: "gustavo.peixoto@exemplo.test" },
  { id: id(13), nome: "Alessandra Brito Campelo", nascimento: "1980-03-21", cpfBase: "634184967", celular: "11990010013" },
  { id: id(14), nome: "Rafael Toledo Guimarães", nomeSocial: "Rafa Toledo", nascimento: "1997-07-15", cpfBase: "745295078", email: "rafa.toledo@exemplo.test" },
  { id: id(15), nome: "Vanessa Moura Siqueira", nascimento: "1990-01-09", cpfBase: "856306189", celular: "11990010015", email: "vanessa.moura@exemplo.test" },
  { id: id(16), nome: "Eduardo Lins Carvalhal", nascimento: "1972-12-18", cpfBase: "967417290", celular: "11990010016" },
  // incompletos (sem CPF), como no cadastro rápido da recepção
  { id: id(17), nome: "Sônia Farias Mendonça", celular: "11990010017" },
  { id: id(18), nome: "Henrique Barreto Dantas", nascimento: "1984-09-27", email: "henrique.barreto@exemplo.test" },
];

/** CPF de 11 dígitos a partir de 9: calcula os dois dígitos verificadores da Receita. */
export function cpfDe(base: string): string {
  if (!/^[0-9]{9}$/.test(base)) throw new RangeError("base do CPF precisa de 9 dígitos");
  const d = [...base].map(Number);
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += d[i]! * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  d.push(dv(9));
  d.push(dv(10));
  return d.join("");
}

const bytea = (b: Uint8Array) => `\\x${Buffer.from(b).toString("hex")}`;

/** Os parâmetros do api.patient_register (cadastro da recepção) para um paciente fictício, já cifrados. */
export async function parametrosDeCadastro(p: PacienteFicticio, chaves: { cofre: Cofre; pepperCpf: Uint8Array }) {
  const cpf = p.cpfBase ? cpfDe(p.cpfBase) : null;
  if (cpf && !isValidCpf(cpf)) throw new Error("CPF gerado inválido");
  const temSegredo = Boolean(cpf || p.celular || p.email);
  let dek: Uint8Array | null = null;
  let wrapped: { kekVersion: number; blob: Uint8Array } | null = null;
  if (temSegredo) {
    const gerada = await chaves.cofre.generateDataKey({ tenant_id: "", table: "network.person", column: "dek", id: p.id });
    dek = gerada.plaintext;
    wrapped = gerada.wrapped;
  }
  try {
    const cifrar = (valor: string | null | undefined, coluna: "cpf_enc" | "phone_enc" | "email_enc") =>
      valor && dek ? bytea(seal(Buffer.from(valor, "utf8"), dek, columnAad("", "network.person", coluna, p.id))) : null;
    return {
      p_id: p.id,
      p_full_name: p.nome,
      p_social_name: p.nomeSocial ?? null,
      p_birth_date: p.nascimento ?? null,
      p_cpf_hmac: cpf ? bytea(cpfHmacWith(chaves.pepperCpf, cpf)) : null,
      p_cpf_masked: cpf ? maskCpf(cpf) : null,
      p_cpf_enc: cifrar(cpf, "cpf_enc"),
      p_phone_enc: cifrar(p.celular, "phone_enc"),
      p_email_enc: cifrar(p.email, "email_enc"),
      p_dek_wrapped: wrapped ? bytea(wrapped.blob) : null,
      p_kek_version: wrapped ? wrapped.kekVersion : null,
      p_is_incomplete: !cpf,
    };
  } finally {
    dek?.fill(0);
  }
}
