import type { CampoEditavel } from "./schema";

// Textos da "Confirme Seus Dados". "PDD": literal do PDD v206 §11.5 (decisão da PO); sem marca: microcopy de tela.
export const TEXTOS = {
  titulo: "Confirme Seus Dados", // PDD §11.5
  tudoCerto: "Está tudo certo", // PDD §11.5
  editar: "Editar informações", // PDD §11.5
  informarNomeSocial: "Informar nome social", // PDD §11.5
  cadastroNovo: "Não encontramos seu cadastro — vamos criar um novo, é rápido.", // PDD §11.4
  cepSemEndereco: "Não encontramos esse CEP. Preencha o endereço.",
  salvando: "Salvando…",
  salvo: "Dados salvos.",
  carregando: "Carregando…",
  tentarDeNovo: "Tentar de novo",
  indisponivel: "Não conseguimos continuar agora. Tente de novo em instantes.",
  vazio: "Não informado",
} as const;

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

export const ERROS: Partial<Record<CampoEditavel, string>> = {
  nome: "Informe o nome completo, com sobrenome.",
  celular: "Informe o celular com DDD.",
  email: "Confira o e-mail.",
  cep: "Informe o CEP com 8 números.",
  uf: "Use a sigla do estado, como SP.",
};
export const ERRO_PADRAO = "Preencha este campo.";
