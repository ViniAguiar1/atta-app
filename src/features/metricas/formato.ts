// Formatos dos números do Painel de Métricas, como no Simulador ATTA-in (captura 40): "3m 27s", "156 h", "+213", "100%".
// Só apresentação: os números chegam prontos do servidor. null → null (a tela mostra "—").

/** 207 → "3m 27s"; 45 → "45s"; 120 → "2m 0s". */
export function duracao(segundos: number | null): string | null {
  if (segundos === null) return null;
  const s = Math.max(0, Math.round(segundos));
  const m = Math.floor(s / 60);
  return m === 0 ? `${s}s` : `${m}m ${s % 60}s`;
}

/** 156 → "156 h". */
export const horas = (valor: number | null) => (valor === null ? null : `${valor.toLocaleString("pt-BR")} h`);

/** 213 → "+213"; 0 → "0". */
export const extras = (valor: number | null) => (valor === null ? null : valor > 0 ? `+${valor.toLocaleString("pt-BR")}` : "0");

/** 1151 → "1.151". */
export const contagem = (valor: number | null) => (valor === null ? null : valor.toLocaleString("pt-BR"));

/** 2 de 2 → "100%"; arredonda para o inteiro. */
export const percentual = (parte: number, total: number) => `${Math.round((parte / total) * 100)}%`;
