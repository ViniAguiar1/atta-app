// Textos do Boarding Check, num lugar só. "PDD": literal do PDD v206. "provisório": o PDD não tem o texto (o §10.2.3
// só diz "senha numérica de 4 dígitos"); vai ao CTO para o migracao/textos-para-a-po.md, aguardando a PO.
export const TEXTOS = {
  titulo: "Boarding Check", // PDD §10.2.3
  pedirSenha: "Digite a senha de 4 números para ver o atendimento.", // provisório
  rotuloSenha: "Senha", // provisório (PDD §10.2.3: "senha numérica de 4 dígitos")
  entrar: "Ver atendimento", // provisório
  conferindo: "Conferindo…", // provisório
  senhaIncompleta: "Digite os 4 números da senha.", // provisório
  senhaNaoConfere: "Senha não confere. Confira e tente de novo.", // provisório
  bloqueado: (minutos: number) =>
    `Muitas tentativas erradas. Tente de novo em ${minutos} ${minutos === 1 ? "minuto" : "minutos"}.`, // provisório
  linkSemValidade: "Este link não vale mais.", // provisório (RN-FIC-07: vencido, concluído ou cancelado)
  linkSemValidadeAjuda: "Se o atendimento ainda não terminou, peça à recepção um novo link.", // provisório
  indisponivel: "Não conseguimos continuar agora. Tente de novo em instantes.", // provisório (igual ao check-in)
  carregando: "Carregando…", // provisório
  // cabeçalho do atendimento (PDD §10.2.3: "resumo do paciente (identificação, tipo de atendimento, histórico de
  // comparecimento)"); rótulos provisórios
  anos: (idade: number) => `${idade} anos`, // provisório
  rotuloHorario: "Horário", // provisório
  rotuloTipo: "Tipo de atendimento", // provisório
  rotuloComparecimento: "Comparecimento", // provisório
  comparecimento: (atendimentos: number, ausencias: number) =>
    `${atendimentos} ${atendimentos === 1 ? "atendimento" : "atendimentos"} · ${ausencias} ${ausencias === 1 ? "ausência" : "ausências"}`, // provisório
} as const;
