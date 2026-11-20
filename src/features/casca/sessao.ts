import type { Papel } from "./abas";

// O que a casca mostra: clínica, pessoa, papel e o contador do sino. Até o login (MIG-03) e as notificações (MIG-15),
// vem uma sessão de demonstração, com nomes fictícios e papel ADMIN, para a casca abrir na prévia. Nada aqui autoriza
// coisa alguma: quem autoriza é a RLS com o papel do token.
export type SessaoDoPainel = { clinica: string; pessoa: { nome: string }; papel: Papel | null; notificacoes: number };

export async function sessaoDoPainel(): Promise<SessaoDoPainel> {
  return { clinica: "Clínica de demonstração", pessoa: { nome: "Pessoa de demonstração" }, papel: "ADMIN", notificacoes: 0 };
}
