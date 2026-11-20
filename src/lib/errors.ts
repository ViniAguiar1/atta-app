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

export type Erro = { code: CodigoDeErro; message: string; fields?: ErroDeCampo[] };

export type Resultado<T> = { ok: true; data: T } | { ok: false; error: Erro };

export const ok = <T>(data: T): Resultado<T> => ({ ok: true, data });

export const falha = (code: CodigoDeErro, message: string, fields?: ErroDeCampo[]): Resultado<never> => ({
  ok: false,
  error: fields ? { code, message, fields } : { code, message },
});

// Erro do Zod vira VALIDACAO só com os caminhos dos campos: o valor recebido não volta (pode ser CPF ou nome).
export function falhaDeValidacao(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>): Resultado<never> {
  const campos = [...new Set(issues.map((i) => i.path.map(String).join(".") || "corpo"))];
  return falha("VALIDACAO", "Confira os campos destacados.", campos.map((campo) => ({ campo, code: "VALIDACAO" })));
}
