// CPF e celular brasileiros, num lugar só (check-in, cadastro e PROpass). Só formato e dígito verificador: quem confere
// a pessoa é o servidor. Regras do PDD v206 §16.6 (celular com DDD válido e 9 dígitos).

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

// DDDs válidos no Brasil (Anatel). Usado na regra "DDD válido e quantidade de dígitos" do §16.6.
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91,
  92, 93, 94, 95, 96, 97, 98, 99,
]);

export function celularValido(valor: string): boolean {
  const d = soDigitos(valor);
  return d.length === 11 && DDDS.has(Number(d.slice(0, 2))) && d[2] === "9";
}

export function mascararCelular(valor: string): string {
  const d = soDigitos(valor).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Nome: mínimo de dois termos (§16.6). */
export const nomeValido = (v: string) => v.trim().split(/\s+/).filter((p) => p.length > 1).length >= 2;

// CNPJ, CEP e telefone fixo (Perfil da Clínica, PDD §10.4.1: "CNPJ (com máscara)", "CEP", "Telefone fixo").
function digitoDoCnpj(base: string): number {
  const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const soma = [...base].reduce((total, d, i) => total + Number(d) * pesos[i]!, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cnpjValido(valor: string): boolean {
  const cnpj = soDigitos(valor);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const d1 = digitoDoCnpj(cnpj.slice(0, 12));
  const d2 = digitoDoCnpj(cnpj.slice(0, 12) + d1);
  return cnpj.endsWith(`${d1}${d2}`);
}

/** Máscara de digitação: 00.000.000/0000-00. */
export function mascararCnpj(valor: string): string {
  const d = soDigitos(valor).slice(0, 14);
  let s = d.slice(0, 2);
  if (d.length > 2) s += `.${d.slice(2, 5)}`;
  if (d.length > 5) s += `.${d.slice(5, 8)}`;
  if (d.length > 8) s += `/${d.slice(8, 12)}`;
  if (d.length > 12) s += `-${d.slice(12)}`;
  return s;
}

/** Máscara de digitação: 00000-000. */
export function mascararCep(valor: string): string {
  const d = soDigitos(valor).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** Telefone fixo ou celular, com DDD: (00) 0000-0000 ou (00) 00000-0000. */
export function mascararTelefone(valor: string): string {
  const d = soDigitos(valor).slice(0, 11);
  if (d.length === 11) return mascararCelular(d);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
}
