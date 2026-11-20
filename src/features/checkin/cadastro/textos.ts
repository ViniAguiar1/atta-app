import type { CampoEditavel } from "./schema";

// Textos da "Confirme Seus Dados", num lugar só. "PDD": literal do PDD v206 (decisão da PO). "provisório": o PDD não
// tem o texto; lista no migracao/textos-para-a-po.md (CTO), aguardando a PO.
export const TEXTOS = {
  titulo: "Confirme Seus Dados", // PDD §11.5
  tudoCerto: "Está tudo certo", // PDD §11.5
  editar: "Editar informações", // PDD §11.5
  informarNomeSocial: "Informar nome social", // PDD §11.5
  cadastroNovo: "Não encontramos seu cadastro — vamos criar um novo, é rápido.", // PDD §11.4
  cepSemEndereco: "Não encontramos esse CEP. Preencha o endereço.", // provisório
  salvando: "Salvando…", // provisório
  salvo: "Dados salvos.", // provisório
  carregando: "Carregando…", // provisório
  tentarDeNovo: "Tentar de novo", // provisório
  indisponivel: "Não conseguimos continuar agora. Tente de novo em instantes.", // provisório
  vazio: "Não informado", // provisório
  buscandoCep: "Buscando endereço…", // provisório
  emailIgnorado: "O e-mail não foi salvo: confira o formato. Seguimos pelo celular.", // provisório
} as const;

// Rótulos: provisórios (o PDD §11.5 lista os dados, sem o texto de cada rótulo).
export const ROTULOS: Record<CampoEditavel | "cpf" | "convenio" | "carteirinha", string> = {
  nome: "Nome completo",
  nomeSocial: "Nome social",
  cpf: "CPF",
  celular: "Celular",
  email: "E-mail",
  convenio: "Plano de saúde",
  carteirinha: "Número da carteirinha",
  cep: "CEP",
  logradouro: "Endereço",
  numero: "Número",
  complemento: "Complemento",
  bairro: "Bairro",
  cidade: "Cidade",
  uf: "Estado (UF)",
};

// Erros de campo: provisórios (o §16.6 dá a regra, sem o texto).
export const ERROS: Partial<Record<CampoEditavel, string>> = {
  nome: "Informe o nome completo, com sobrenome.",
  celular: "Informe o celular com DDD.",
  email: "Confira o e-mail.",
  cep: "Informe o CEP com 8 números.",
  uf: "Use a sigla do estado, como SP.",
};
export const ERRO_PADRAO = "Preencha este campo.";
