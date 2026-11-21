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
  selecione: "Selecione", // provisório (opção vazia dos selects)
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
  naoConsultado: // provisório (decisão do dono, 20/11; vai à PO): conclui, mas só é agendado depois da conferência
    "A conferência do seu registro no conselho é feita pela equipe ATTA. Você já pode concluir; a clínica só agenda seus atendimentos depois dessa conferência.",
  conselhoNaoConfere: "Não encontramos registro ativo com esse conselho, número e UF. Confira os dados.", // provisório
  linkSemValidade: "Este convite não vale mais.", // provisório (link de 7 dias, PDD §10.4.3)
  linkSemValidadeAjuda: "Peça à clínica que reenvie o link do PROpass.", // provisório
  indisponivel: "Não conseguimos continuar agora. Tente de novo em instantes.", // provisório (igual ao check-in)
  carregando: "Carregando…", // provisório
  // passo 3: Termo de Autorização (simulador, captura 26; texto do termo vem do servidor)
  passo3: "Passo 3 de 4 · Assinatura", // simulador
  termoIntro:
    "Leia até o fim: o quadro de assinatura só abre depois da leitura completa. Este termo é sobre o seu vínculo com a clínica, não sobre um atendimento. Por isso ele nasce Assinado, sem passar por Pré-assinado, e já sai com hash e Código ATTA verificáveis.", // simulador (sem a referência interna CA-E04-03)
  leiaAteOFim: "Leia até o fim para liberar a assinatura.", // simulador
  quadro: "Desenhe sua assinatura com o mouse ou o dedo", // simulador
  botaoBloqueado: "Leia o termo até o fim para assinar", // simulador
  assinar: "Assinar o termo", // provisório (o simulador troca o botão, sem o texto capturado)
  limpar: "Limpar assinatura", // provisório
  semAssinatura: "Desenhe sua assinatura no quadro.", // provisório
  rotuloTermo: "Texto do Termo de Autorização", // provisório (região rolável, leitor de tela)
  // passo 3b: senha de 4 números (decisão do dono, R10; não existe no simulador)
  passoSenha: "Passo 3 de 4 · Senha", // provisório
  senhaTitulo: "Crie sua senha de 4 números", // provisório
  senhaTexto: "É a senha que você digita para abrir o Boarding Check de cada atendimento. Ela nunca vai junto com o link.", // provisório
  rotuloSenha: "Senha", // provisório
  rotuloConfirmar: "Confirme a senha", // provisório
  senhaFormato: "A senha tem 4 números.", // provisório
  senhaObvia: "Escolha uma senha menos óbvia: evite números repetidos ou em sequência.", // provisório (decisão do CTO, R12)
  senhaDiferente: "As duas senhas não são iguais.", // provisório
  concluir: "Concluir o PROpass", // provisório
  enviando: "Enviando…", // provisório
  recusado: "Não conseguimos confirmar seus dados. Confira o CPF e o conselho ou fale com a clínica.", // provisório
  // passo 4 (PDD §10.4.3: mini-explicação; o simulador não foi capturado)
  passo4: "Passo 4 de 4 · Como você recebe documentos", // simulador (aba "Como você recebe documentos")
  concluidoTitulo: "PROpass concluído", // provisório
  concluidoTexto:
    "Você não tem login nem painel no ATTA‑in. Para cada atendimento, chega pelo WhatsApp um link só daquele paciente, com o Formulário de Saúde e os termos, que você abre com a sua senha de 4 números.", // provisório (PDD §10.4.3 e §10.2.3)
  aguardandoConferencia:
    "A conferência do seu registro no conselho é feita pela equipe ATTA. A clínica só agenda seus atendimentos depois dessa conferência.", // provisório (decisão do dono, 20/11)
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

/** Campo obrigatório vazio (nota do QA 2 no #127): o CPF vazio não "não bate", ele falta. */
export const VAZIOS: Partial<Record<CampoDosDados, string>> = {
  cpf: "Informe o CPF.", // provisório
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
