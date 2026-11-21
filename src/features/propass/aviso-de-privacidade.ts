// Aviso de Privacidade do Profissional (PDD v206 §10.4.3; decisão da PO): na tela do PROpass, antes do Termo, com a
// confirmação de leitura, e a versão confirmada gravada no banco (privacy_notice_version e privacy_notice_ack_at).
// TRAVA (CTO, P2b, 21/11): desligado até a PO mandar o texto oficial. Com null, o passo não aparece e o envio vai sem
// versão; quando o texto chegar, preencher aqui (versão nova a cada mudança de texto) liga o passo e torna a ciência
// obrigatória no servidor (actions.ts confere a versão). Nunca texto inventado aqui: só o oficial da PO.
export type AvisoDePrivacidade = Readonly<{ versao: string; titulo: string; paragrafos: readonly string[] }>;

export const AVISO_DE_PRIVACIDADE: AvisoDePrivacidade | null = null;
