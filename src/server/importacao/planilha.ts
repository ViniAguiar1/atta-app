import "server-only";
/**
 * Validação da planilha modelo da importação (PDD v206 §10.1). Função pura sobre o texto das células: quem lê o .xlsx
 * (o adaptador, no próximo PR) entrega as abas, o cabeçalho e as linhas; aqui só se decide o que entra.
 *
 * - Fora do modelo (sem a aba "Pacientes" ou sem os 5 títulos): recusado inteiro, não vira pendência de linha.
 * - Só 5 campos: nome completo, CPF, data de nascimento, celular, e-mail. O resto do arquivo é descartado.
 * - Nome completo e CPF obrigatórios: sem um deles (ou com CPF inválido), a linha não entra.
 * - Celular, e-mail e nascimento fora da forma entram em branco ("se faltarem, entram em branco").
 * - CPF repetido: com os mesmos dados, fica a primeira linha; com dados diferentes, nenhuma entra.
 * Nada do conteúdo da linha sai daqui em erro: só o número da linha (como no Excel, cabeçalho = 1) e o código.
 */
import { celularValido, cpfValido } from "@/lib/brasil/documentos";
import type { CampoDescartado, MotivoLinha } from "./porta";

export const ABA = "Pacientes";
export const COLUNAS = ["Nome completo", "CPF", "Data de nascimento", "Celular", "E-mail"] as const;
export const LIMITE_BYTES = 20 * 1024 * 1024; // "até 20 MB" (§10.1)
/** O PDD não limita linhas; este teto protege o servidor e cobre com folga uma base de clínica. */
export const LIMITE_LINHAS = 20_000;

export type PacienteDaPlanilha = {
  line: number;
  nomeCompleto: string;
  cpf: string; // 11 dígitos
  nascimento?: string; // AAAA-MM-DD
  celular?: string; // +55DDXXXXXXXXX
  email?: string;
};

export type AnaliseDaPlanilha =
  | { ok: false; motivo: "fora_do_modelo" | "linhas_demais" }
  | {
      ok: true;
      total: number;
      validos: PacienteDaPlanilha[];
      errors: { line: number; code: MotivoLinha }[];
      blanked: { line: number; field: CampoDescartado }[];
    };

const normal = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

/** CPF que o Excel virou número perde o zero à esquerda: completa até 11 dígitos. */
export function normalizarCpf(valor: string): string {
  const d = valor.replace(/\D/g, "");
  return d.length > 0 && d.length < 11 ? d.padStart(11, "0") : d;
}

function normalizarNascimento(valor: string, hoje: Date): string | undefined {
  const t = valor.trim();
  let iso: string | undefined;
  let m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (m) iso = `${m[3]}-${m[2]}-${m[1]}`;
  m = m ? null : /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) iso = `${m[1]}-${m[2]}-${m[3]}`;
  // data que o Excel virou número de série (dias desde 30/12/1899)
  if (!iso && /^\d{4,5}$/.test(t))
    iso = new Date(Date.UTC(1899, 11, 30) + Number(t) * 86_400_000).toISOString().slice(0, 10);
  if (!iso) return undefined;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(iso) && d.getUTCFullYear() >= 1900 && d <= hoje
    ? iso
    : undefined;
}

function normalizarCelular(valor: string): string | undefined {
  let d = valor.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  return celularValido(d) ? `+55${d}` : undefined;
}

function normalizarEmail(valor: string): string | undefined {
  const e = valor.trim().toLowerCase();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : undefined;
}

/** Confere a aba e os títulos e decide, linha a linha, o que entra. */
export function analisarPlanilha(
  abas: readonly string[],
  cabecalho: readonly string[],
  linhas: readonly (readonly string[])[],
  hoje = new Date(),
): AnaliseDaPlanilha {
  const titulos = cabecalho.map(normal);
  const indice = COLUNAS.map((c) => titulos.indexOf(normal(c)));
  if (!abas.some((a) => normal(a) === normal(ABA)) || indice.some((i) => i < 0))
    return { ok: false, motivo: "fora_do_modelo" };
  if (linhas.length > LIMITE_LINHAS) return { ok: false, motivo: "linhas_demais" };
  const [iNome, iCpf, iNasc, iCel, iEmail] = indice as [number, number, number, number, number];

  const errors: { line: number; code: MotivoLinha }[] = [];
  const blanked: { line: number; field: CampoDescartado }[] = [];
  const candidatos: PacienteDaPlanilha[] = [];
  let total = 0;

  linhas.forEach((l, i) => {
    const line = i + 2;
    const celula = (j: number) => (l[j] ?? "").trim();
    if (COLUNAS.every((_, k) => celula(indice[k]!) === "")) return; // linha vazia não conta
    total++;
    const nomeCompleto = celula(iNome).replace(/\s+/g, " ");
    const cpfCru = celula(iCpf);
    if (!nomeCompleto) return void errors.push({ line, code: "nome_ausente" });
    if (!cpfCru) return void errors.push({ line, code: "cpf_ausente" });
    const cpf = normalizarCpf(cpfCru);
    if (!cpfValido(cpf)) return void errors.push({ line, code: "cpf_invalido" });

    const opcional = <T>(cru: string, campo: CampoDescartado, f: (s: string) => T | undefined): T | undefined => {
      if (!cru) return undefined;
      const v = f(cru);
      if (v === undefined) blanked.push({ line, field: campo });
      return v;
    };
    const nascimento = opcional(celula(iNasc), "nascimento", (s) => normalizarNascimento(s, hoje));
    const celular = opcional(celula(iCel), "celular", normalizarCelular);
    const email = opcional(celula(iEmail), "email", normalizarEmail);
    candidatos.push({
      line,
      nomeCompleto,
      cpf,
      ...(nascimento ? { nascimento } : {}),
      ...(celular ? { celular } : {}),
      ...(email ? { email } : {}),
    });
  });

  // CPF repetido: igual = fica a primeira; diferente = nenhuma entra
  const porCpf = new Map<string, PacienteDaPlanilha[]>();
  for (const c of candidatos) porCpf.set(c.cpf, [...(porCpf.get(c.cpf) ?? []), c]);
  const assinatura = (p: PacienteDaPlanilha) =>
    [normal(p.nomeCompleto), p.nascimento ?? "", p.celular ?? "", p.email ?? ""].join("|");
  const validos: PacienteDaPlanilha[] = [];
  for (const grupo of porCpf.values()) {
    const [primeiro, ...resto] = grupo as [PacienteDaPlanilha, ...PacienteDaPlanilha[]];
    if (resto.every((r) => assinatura(r) === assinatura(primeiro))) {
      validos.push(primeiro);
      for (const r of resto) errors.push({ line: r.line, code: "cpf_repetido_na_planilha" });
    } else {
      for (const r of grupo) errors.push({ line: r.line, code: "repetido_diferente" });
    }
  }

  errors.sort((a, b) => a.line - b.line);
  validos.sort((a, b) => a.line - b.line);
  const entram = new Set(validos.map((v) => v.line)); // aviso de campo em branco só para linha que entra
  return { ok: true, total, validos, errors, blanked: blanked.filter((b) => entram.has(b.line)) };
}
