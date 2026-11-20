// Logger mínimo (ADR 0001 §5): uma linha JSON por evento, o único lugar com console.* (regra do ESLint).
// Nunca passe CPF, nome, telefone, e-mail, resposta de saúde nem token em `contexto`: os logs da Vercel e do Supabase
// guardam o que chega aqui. O scrubber automático vem depois; até lá, a regra é de quem chama.
type Nivel = "debug" | "info" | "warn" | "error";
type Contexto = Record<string, string | number | boolean | null | undefined>;

function emitir(nivel: Nivel, evento: string, contexto: Contexto = {}) {
  const linha = JSON.stringify({ nivel, evento, ...contexto, em: new Date().toISOString() });
  if (nivel === "error") console.error(linha);
  else if (nivel === "warn") console.warn(linha);
  else console.log(linha);
}

export const logger = {
  debug: (evento: string, contexto?: Contexto) => emitir("debug", evento, contexto),
  info: (evento: string, contexto?: Contexto) => emitir("info", evento, contexto),
  warn: (evento: string, contexto?: Contexto) => emitir("warn", evento, contexto),
  error: (evento: string, contexto?: Contexto) => emitir("error", evento, contexto),
};
