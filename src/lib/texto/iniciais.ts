/** Iniciais do avatar, como no Simulador ATTA-in: primeira letra do primeiro e do último nome ("Marina Duarte" → "MD"). */
export function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const letras = partes.length > 1 ? [partes[0], partes[partes.length - 1]] : partes;
  return letras.map((parte) => parte?.charAt(0) ?? "").join("").toLocaleUpperCase("pt-BR");
}
