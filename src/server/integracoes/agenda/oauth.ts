import "server-only";
/**
 * URLs de autorização OAuth (PKCE S256, state preso à sessão, redirect exato).
 * Chaves (só os nomes; o dono cadastra quando as contas existirem): ATTA_AGENDA_GOOGLE_CLIENT_ID e _SECRET, e
 * ATTA_AGENDA_MICROSOFT_CLIENT_ID e _SECRET (cliente separado do login com Google: os escopos de agenda são sensíveis).
 * A troca do código, a renovação e a leitura de eventos dos provedores reais vêm no próximo PR do MIG-33.
 */
import { createHash, randomBytes } from "node:crypto";
import { ESCOPOS } from "./porta";

export function gerarPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function urlAutorizacaoGoogle(
  clientId: string,
  p: { state: string; codeChallenge: string; redirectUri: string },
): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: p.redirectUri,
    response_type: "code",
    scope: ESCOPOS.google.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: p.state,
    code_challenge: p.codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return u.toString();
}

/** App multi-inquilino (`common`): a clínica entra com conta Microsoft 365 ou pessoal. */
export function urlAutorizacaoMicrosoft(
  clientId: string,
  p: { state: string; codeChallenge: string; redirectUri: string },
): string {
  const u = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
  u.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: p.redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: ESCOPOS.microsoft.join(" "),
    state: p.state,
    code_challenge: p.codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return u.toString();
}
