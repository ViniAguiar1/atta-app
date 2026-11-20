// Padrão de erro das bordas (ADR 0001 §5; porte do RFC 9457 do atta-core): server action e route handler devolvem
// Resultado. O `code` vem desta lista fechada; a `message` é em português e nunca carrega dado pessoal.
export const CODIGOS_DE_ERRO = [
  "VALIDACAO", // corpo ou campo fora do formato (Zod)
  "NAO_AUTENTICADO", // sem sessão
  "SEM_PERMISSAO", // sessão sem o papel ou a permissão
  "NAO_ENCONTRADO", // recurso inexistente ou de outra clínica (a mesma resposta, de propósito)
  "CONFLITO", // estado não permite a operação
  "LIMITE", // excesso de tentativas
  "INDISPONIVEL", // dependência fora do ar
  "INTERNO", // falha não prevista
] as const;

export type CodigoDeErro = (typeof CODIGOS_DE_ERRO)[number];

export type ErroDeCampo = { campo: string; code: CodigoDeErro };

/**
 * `reason` (ADR 0001 §5): o código estável da regra que o banco levantou, para a tela reagir sem comparar texto. É o
 * `message` da exceção (`ATTA-IN-0002`) e, quando houver, o `detail` depois de dois-pontos (`ATTA-IN-0002:cpf`).
 */
export type Erro = { code: CodigoDeErro; message: string; fields?: ErroDeCampo[]; reason?: string };

export type Resultado<T> = { ok: true; data: T } | { ok: false; error: Erro };

export const ok = <T>(data: T): Resultado<T> => ({ ok: true, data });

export const falha = (
  code: CodigoDeErro,
  message: string,
  fields?: ErroDeCampo[],
  reason?: string,
): Resultado<never> => ({
  ok: false,
  error: { code, message, ...(fields ? { fields } : {}), ...(reason ? { reason } : {}) },
});

// --- Erro do banco (PostgREST / supabase-js) ------------------------------------------------------------------------
// As funções do banco levantam `raise exception using errcode = '<SQLSTATE>', message = 'ATTA-IN-0002', detail = 'cpf'`.
// O PostgREST devolve { code: SQLSTATE ou PGRSTnnn, message, details, hint }. Daqui sai o Resultado da borda: o `code`
// da lista fechada pelo SQLSTATE, o `reason` pela regra e uma mensagem nossa. A mensagem e o detalhe crus do banco
// nunca voltam: um erro nativo pode ecoar valor ("Key (cpf_hmac)=(...) already exists").
export type ErroDoBanco = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

const REGRA = /^ATTA-[A-Z]+-\d{4}$/;
// O detail só entra quando é um identificador (nome de campo ou de regra), nunca um valor.
const DETALHE = /^[a-z][a-z0-9_.]{0,62}$/;

export const MENSAGENS: Record<CodigoDeErro, string> = {
  VALIDACAO: "Confira os campos destacados.",
  NAO_AUTENTICADO: "Sua sessão terminou. Entre de novo.",
  SEM_PERMISSAO: "Você não tem permissão para isso.",
  NAO_ENCONTRADO: "Não encontramos o que você procurou.",
  CONFLITO: "Não foi possível concluir por causa da situação atual.",
  LIMITE: "Muitas tentativas. Aguarde e tente de novo.",
  INDISPONIVEL: "Serviço indisponível no momento. Tente de novo.",
  INTERNO: "Algo deu errado. Tente de novo.",
};

/** O reason de um erro do banco, ou undefined quando o banco não levantou uma regra nossa. */
export function reasonDoBanco(erro: ErroDoBanco): string | undefined {
  const regra = erro.message?.trim();
  if (!regra || !REGRA.test(regra)) return undefined;
  const detalhe = erro.details?.trim();
  return detalhe && DETALHE.test(detalhe) ? `${regra}:${detalhe}` : regra;
}

/** Separa o reason em regra e detalhe (`ATTA-IN-0002:cpf` → { regra: "ATTA-IN-0002", detalhe: "cpf" }). */
export function lerReason(reason: string): { regra: string; detalhe?: string } {
  const [regra = reason, detalhe] = reason.split(":", 2);
  return detalhe ? { regra, detalhe } : { regra };
}

const NAO_AUTENTICADO = new Set(["PGRST301", "PGRST302", "28000", "28P01"]);
const NAO_ENCONTRADO = new Set(["P0002", "PGRST116"]);
const CONFLITO = new Set(["23505", "23P01", "40001", "40P01"]);
const VALIDACAO = new Set(["23502", "23503", "23514"]);
const LIMITE = new Set(["53400", "54000"]);

function codigoDoBanco(sqlstate: string, regra: string | undefined): CodigoDeErro {
  if (NAO_AUTENTICADO.has(sqlstate)) return "NAO_AUTENTICADO";
  if (sqlstate === "42501") return "SEM_PERMISSAO";
  if (NAO_ENCONTRADO.has(sqlstate)) return "NAO_ENCONTRADO";
  if (CONFLITO.has(sqlstate)) return "CONFLITO";
  // P0001 é regra de negócio: a -0001 de cada domínio é "valor recusado"; as outras, estado que não permite
  if (sqlstate === "P0001") return regra?.endsWith("-0001") ? "VALIDACAO" : "CONFLITO";
  if (sqlstate.startsWith("22") || VALIDACAO.has(sqlstate)) return "VALIDACAO";
  if (LIMITE.has(sqlstate)) return "LIMITE";
  if (/^(08|53|57)/.test(sqlstate) || /^PGRST00[0-3]$/.test(sqlstate)) return "INDISPONIVEL";
  return "INTERNO";
}

/**
 * Erro do banco vira o Resultado da borda. Validação com detail traz o campo em `fields`. Sem `code` (falha de rede
 * do fetch, antes de o PostgREST responder), é INDISPONIVEL.
 */
export function falhaDoBanco(erro: ErroDoBanco): Resultado<never> {
  const reason = reasonDoBanco(erro);
  const lido = reason ? lerReason(reason) : undefined;
  const code = erro.code ? codigoDoBanco(erro.code, lido?.regra) : "INDISPONIVEL";
  const fields = code === "VALIDACAO" && lido?.detalhe ? [{ campo: lido.detalhe, code }] : undefined;
  return falha(code, MENSAGENS[code], fields, reason);
}

// Erro do Zod vira VALIDACAO só com os caminhos dos campos: o valor recebido não volta (pode ser CPF ou nome).
export function falhaDeValidacao(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>): Resultado<never> {
  const campos = [...new Set(issues.map((i) => i.path.map(String).join(".") || "corpo"))];
  return falha("VALIDACAO", MENSAGENS.VALIDACAO, campos.map((campo) => ({ campo, code: "VALIDACAO" })));
}
