// As rotas do login e da guarda num lugar só (contrato com o Tech Lead e o Frontend). O proxy só redireciona; quem
// autoriza o dado é a RLS (has_permission).
export const PREFIXO_PAINEL = "/painel";
export const ROTA_LOGIN = "/login"; // PDD v206 §10.4.9: "Acesse a plataforma" leva ao /login
export const ROTA_SEM_CLINICA = "/sem-clinica";
export const ROTA_CALLBACK = "/auth/callback";
// "Esqueci a senha" e convite (MIG-03c): o link do e-mail vai ao /auth/confirm, que abre a sessão e leva à nova senha
export const ROTA_ESQUECI = "/login/esqueci";
export const ROTA_CONFIRMAR = "/auth/confirm";
export const ROTA_DEFINIR_SENHA = "/definir-senha";
// Segundo fator: obrigatório para o ADMIN, opcional para o COLABORADOR (decisão do dono, 20/11; PLANO). A trava de
// verdade é o has_permission no banco (sem aal2, o ADMIN não tem permissão); a guarda aqui só leva à tela certa.
export const ROTA_2FA = "/painel/seguranca/2fa";
export const EXIGE_2FA_DO_ADMIN = true;
// Rotas de link (paciente, profissional, verificação): grant do link, nunca sessão de staff; fora da guarda.
export const ROTAS_DE_LINK = ["/checkin", "/ficha", "/boarding", "/propass", "/verificar"] as const;

export const exigeSessao = (caminho: string) => caminho === PREFIXO_PAINEL || caminho.startsWith(`${PREFIXO_PAINEL}/`);

// Para onde voltar depois do login: só caminho interno do painel. URL de fora (https://…, //host) ou qualquer outra
// coisa vira o início do painel, para o login não servir de redirecionamento aberto.
export function destinoSeguro(volta: string | null | undefined): string {
  if (!volta || !volta.startsWith("/") || volta.startsWith("//") || volta.includes("\\")) return PREFIXO_PAINEL;
  try {
    const url = new URL(volta, "http://interno.invalid");
    if (url.origin !== "http://interno.invalid" || !exigeSessao(url.pathname)) return PREFIXO_PAINEL;
    return `${url.pathname}${url.search}`;
  } catch {
    return PREFIXO_PAINEL;
  }
}

type Claims = { tenant_id?: unknown; app_role?: unknown; aal?: unknown } | null | undefined;

// Para onde a guarda manda, ou null para seguir. Pura (o proxy só aplica), para o teste cobrir todos os casos.
// "/" e /login (regra do stage, ADR 0001 §4): com sessão vão ao painel; "/" sem sessão vai à tela de entrar.
export function decidirGuarda(caminho: string, busca: string, claims: Claims): string | null {
  if (caminho === "/") return claims ? PREFIXO_PAINEL : ROTA_LOGIN;
  if (caminho === ROTA_LOGIN) return claims ? PREFIXO_PAINEL : null;
  if (!exigeSessao(caminho)) return null;
  if (!claims) return `${ROTA_LOGIN}?volta=${encodeURIComponent(caminho + busca)}`;
  if (typeof claims.tenant_id !== "string") return ROTA_SEM_CLINICA;
  const naTelaDo2fa = caminho === ROTA_2FA || caminho.startsWith(`${ROTA_2FA}/`);
  if (EXIGE_2FA_DO_ADMIN && claims.app_role === "ADMIN" && claims.aal !== "aal2" && !naTelaDo2fa) {
    return `${ROTA_2FA}?volta=${encodeURIComponent(caminho + busca)}`;
  }
  return null;
}
