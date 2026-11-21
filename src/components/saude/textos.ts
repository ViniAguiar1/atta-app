// Textos do componente de leitura do Formulário de Saúde, num lugar só. "PDD": literal do PDD v206. "provisório": o PDD
// não tem o texto; vai ao CTO para o textos-para-a-po.md.
export const textos = {
  titulo: "Formulário de Saúde", // PDD §10.3.2
  sim: "Sim", // PDD §10.3.2.1 ("Sim ou Não")
  nao: "Não", // PDD §10.3.2.1
  recusada: "Prefiro não responder", // PDD RN-FSA-10
  outro: (texto: string) => `Outro: ${texto}`, // provisório
  semResposta: "Sem resposta", // provisório
  destaque: "Destaque da clínica", // provisório (RN-FSA-14: sem interpretação, recomendação nem bloqueio)
} as const;
