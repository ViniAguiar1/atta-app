import type { CampoDosDados, Conselho } from "./schema";

// Textos do PROpass, num lugar só. "PDD": literal do PDD v206. "simulador": literal do Simulador ATTA-in (capturas 24 e
// 25), que vale onde o PDD não tem texto. "provisório": nem um nem outro; vai ao CTO para o textos-para-a-po.md.
export const TEXTOS = {
  titulo: "PROpass", // PDD §10.4.3
  passo1: "Passo 1 de 4 · Confirmação de dados", // simulador
  saudacao: "Confirme quem é você", // simulador, sem o nome: quem preenche o nome é o profissional (decisão do dono)
  convite: (clinica: string) =>
    `${clinica} convidou você para assinar documentos dos seus atendimentos. É você quem preenche os dados, não a clínica.`, // simulador
  ajudaEmail: "Travado: é o e-mail que recebeu o convite.", // simulador
  ajudaCpf: "Validado pelos dígitos verificadores.", // simulador
  ajudaWhatsapp: "É por aqui que você recebe o Boarding Check de cada atendimento.", // simulador
  conviteEm: (quando: string) => `Convite de ${quando}`, // simulador
  continuar: "Continuar", // simulador
  voltar: "Voltar", // simulador
  conferindo: "Conferindo…", // provisório
  passo2: "Passo 2 de 4 · Validação do conselho", // simulador (aba "Validação do conselho")
  camada1: "Camada 1 — Validação ATTA (Conselho)", // PDD §10.4.3
  situacaoTitulo: "Situação do seu registro", // simulador
  regularizado: "Regularizado (Conselho Ativo)", // PDD §10.4.3
  consultadoEm: (hora: string) => `consultado às ${hora}`, // simulador
  colunaConselho: "Conselho", // simulador
  colunaRegistro: "Registro", // simulador
  colunaNome: "Nome", // simulador
  conselhoNaoConfere: "Não encontramos registro ativo com esse conselho, número e UF. Confira os dados.", // provisório
  linkSemValidade: "Este convite não vale mais.", // provisório (link de 7 dias, PDD §10.4.3)
  linkSemValidadeAjuda: "Peça à clínica que reenvie o link do PROpass.", // provisório
  indisponivel: "Não conseguimos continuar agora. Tente de novo em instantes.", // provisório (igual ao check-in)
  carregando: "Carregando…", // provisório
} as const;

export const ROTULOS: Record<CampoDosDados | "email", string> = {
  nome: "Nome completo", // simulador
  email: "E-mail profissional", // simulador
  cpf: "CPF", // simulador
  whatsapp: "WhatsApp de contato", // simulador
  conselho: "Conselho", // simulador
  numero: "Número de registro", // simulador
  uf: "UF", // simulador
};

export const ERROS: Record<CampoDosDados, string> = {
  nome: "Informe o nome completo, com sobrenome.", // provisório (igual ao cadastro do paciente)
  cpf: "Confira o CPF: algum número não bate.", // provisório (igual ao check-in)
  whatsapp: "Informe o celular com DDD.", // provisório (igual ao cadastro do paciente)
  conselho: "Escolha o conselho.", // provisório
  numero: "Informe o número de registro, só com números.", // provisório
  uf: "Escolha a UF do registro.", // provisório
};

// "CRM · Medicina" é do simulador; as outras linhas seguem o mesmo formato (provisório). Lista do PDD §10.4.3.
export const NOMES_DOS_CONSELHOS: Record<Conselho, string> = {
  crm: "CRM · Medicina",
  cro: "CRO · Odontologia",
  crbm: "CRBM · Biomedicina",
  coren: "COREN · Enfermagem",
  crefito: "CREFITO · Fisioterapia",
  crn: "CRN · Nutrição",
  cfp: "CFP · Psicologia",
  esteticista_ou_equivalente: "Registro de Esteticista ou equivalente", // PDD §10.4.3
};
