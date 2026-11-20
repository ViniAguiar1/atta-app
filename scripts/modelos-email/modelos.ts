// Modelos dos e-mails do Auth (supabase/templates): um modelo-base e as variações de texto. O HTML final é gerado e
// conferido pelo modelos.test.ts (snapshot em arquivo): para regravar os .html, rode
//   pnpm vitest run scripts/modelos-email -u
// e confira o diff. O Supabase lê só os .html (config.toml, [auth.email.template.*]); nada aqui roda no app.
//
// HTML de e-mail: tabelas de layout com role="presentation", CSS inline (o <style> só reforça o modo escuro e o
// celular, onde o cliente aceita), 600 px no máximo (no Outlook do Windows, que ignora max-width, por tabela condicional), fontes do Guia com fallback de sistema (fonte web não carrega no
// Gmail nem no Outlook), sem JavaScript, sem fonte ou CSS de fora e sem pixel de rastreio. A única imagem é o logo,
// servido pelo próprio atta-app ({{ .SiteURL }}/email/atta-in.png), com alt; o nome ATTA-in também está no texto.
// Variáveis só do Supabase: {{ .SiteURL }} e {{ .TokenHash }}. Nenhum dado pessoal além do e-mail de destino, que o
// próprio envio já tem (RN-NOT-01: nenhuma notificação contém dado de saúde).
import { readFileSync } from "node:fs";

/** Textos do PDD v206 ou provisórios. O PDD não tem texto de e-mail de login (§10.4.3 só cita o convite): tudo aqui é
 *  provisório, do #63 ou novo; os novos e os alterados vão ao CTO para o textos-para-a-po.md. */
const comum = {
  marca: "ATTA-in", // provisório (#63)
  alternativa: "Se o botão não funcionar, copie e cole este endereço no navegador:", // provisório (novo)
  validade: "O link vale 1 hora e só funciona uma vez.", // provisório (alterado do #63, pedido do CTO)
  rodape: "ATTA-in · E-mail automático, não responda.", // provisório (novo)
};

export type Modelo = {
  arquivo: "invite.html" | "recovery.html";
  tipo: "invite" | "recovery"; // o type que o /auth/confirm aceita (src/app/auth/confirm/route.ts)
  preCabecalho: string; // a linha que o cliente mostra ao lado do assunto, escondida no corpo
  titulo: string;
  paragrafo: string;
  botao: string;
  seNaoPediu: string;
};

export const MODELOS: readonly Modelo[] = [
  {
    arquivo: "invite.html",
    tipo: "invite",
    preCabecalho: "Aceite o convite e crie a sua senha de acesso.", // provisório (novo)
    titulo: "Convite para o painel da clínica", // provisório (novo; o mesmo do assunto no config.toml)
    paragrafo: "Você foi convidado para acessar o painel da clínica no ATTA-in.", // provisório (#63)
    botao: "Aceitar o convite e criar a senha", // provisório (#63)
    seNaoPediu: "Se você não esperava este convite, ignore este e-mail.", // provisório (alterado do #63)
  },
  {
    arquivo: "recovery.html",
    tipo: "recovery",
    preCabecalho: "Use o link para criar uma nova senha de acesso.", // provisório (novo)
    titulo: "Criar nova senha", // provisório (novo; o mesmo do assunto no config.toml)
    paragrafo: "Recebemos um pedido para criar uma nova senha de acesso ao painel da clínica.", // provisório (#63)
    botao: "Criar nova senha", // provisório (#63)
    seNaoPediu: "Se você não pediu uma nova senha, ignore este e-mail: a sua senha atual continua valendo.", // provisório (alterado do #63)
  },
];

// Cores e fontes só dos tokens do Guia v21 (src/styles/tokens.css), resolvidas até o valor: e-mail não lê var().
const tokens = readFileSync(new URL("../../src/styles/tokens.css", import.meta.url), "utf8");
export function token(nome: string): string {
  const valor = tokens.match(new RegExp(`${nome}:\\s*([^;]+);`))?.[1]?.trim();
  if (!valor) throw new Error(`token ausente: ${nome}`);
  const ref = valor.match(/^var\((--[a-z0-9-]+)\)$/);
  return ref?.[1] ? token(ref[1]) : valor;
}

export const COR = {
  marca: token("--color-brand"), // barra e botão (#2c3128)
  sobreMarca: token("--color-on-brand"),
  texto: token("--color-text-primary"),
  textoSecundario: token("--color-text-secondary"),
  fundo: token("--color-surface-app"),
  cartao: token("--color-surface-raised"),
  borda: token("--color-border"),
};
// a 1ª fonte do token e o fallback de sistema
const FONTE_CORPO = `${token("--font-body").split(",")[0]}, 'Segoe UI', Helvetica, Arial, sans-serif`;
const FONTE_TITULO = `${token("--font-title").split(",")[0]}, Georgia, 'Times New Roman', serif`;

// o tamanho do logo em CSS px (gerar-logo.mjs gera em 2×); a imagem tem 8 px de respiro à esquerda, por isso o
// cabeçalho usa 8 px a menos de padding que o cartão, e o monograma alinha com o título
const LOGO = { largura: 152, altura: 42 };

/** Escapa texto para HTML; as variáveis do Supabase entram à parte, já no formato {{ . }}. */
function texto(valor: string): string {
  return valor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderizar(m: Modelo): string {
  const link = `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=${m.tipo}`;
  const aspasFonte = (f: string) => f.replace(/"/g, "'");
  const corpo = aspasFonte(FONTE_CORPO);
  const tituloFonte = aspasFonte(FONTE_TITULO);
  return `<!doctype html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${texto(m.titulo)} · ${texto(comum.marca)}</title>
<!--[if mso]><style>table,td,a,p,h1{font-family:Arial,sans-serif !important;}</style><![endif]-->
<style>
  @media (max-width: 620px) {
    .cartao { padding: 28px 20px !important; }
    .cabecalho { padding: 16px 12px !important; }
    .botao a { display: block !important; }
  }
  @media (prefers-color-scheme: dark) {
    body, .fundo { background-color: ${COR.texto} !important; }
    .cartao { background-color: ${COR.marca} !important; border-color: ${COR.marca} !important; }
    .cartao h1, .cartao p, .cartao a.link { color: ${COR.sobreMarca} !important; }
    .botao td { background-color: ${COR.sobreMarca} !important; }
    .botao a { color: ${COR.marca} !important; }
    .rodape p { color: ${COR.borda} !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:${COR.fundo};">
<div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">${texto(m.preCabecalho)}</div>
<table role="presentation" class="fundo" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COR.fundo};">
<tr><td align="center" style="padding:24px 12px;">
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
    <tr><td class="cabecalho" bgcolor="${COR.marca}" style="background-color:${COR.marca}; border-radius:10px 10px 0 0; padding:18px 24px;">
      <img src="{{ .SiteURL }}/email/atta-in.png" width="${LOGO.largura}" height="${LOGO.altura}" alt="${texto(comum.marca)}" style="display:block; border:0; outline:none; text-decoration:none; color:${COR.sobreMarca}; font-family:${corpo}; font-size:24px;">
    </td></tr>
    <tr><td class="cartao" bgcolor="${COR.cartao}" style="background-color:${COR.cartao}; border:1px solid ${COR.borda}; border-top:0; border-radius:0 0 10px 10px; padding:36px 32px; font-family:${corpo}; color:${COR.texto};">
      <h1 style="margin:0 0 16px; font-family:${tituloFonte}; font-size:26px; line-height:1.25; font-weight:400; color:${COR.texto};">${texto(m.titulo)}</h1>
      <p style="margin:0 0 28px; font-size:16px; line-height:1.5; color:${COR.texto};">${texto(m.paragrafo)}</p>
      <table role="presentation" class="botao" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
        <tr><td bgcolor="${COR.marca}" style="background-color:${COR.marca}; border-radius:6px;">
          <a href="${link}" style="display:inline-block; padding:15px 28px; font-family:${corpo}; font-size:17px; font-weight:600; line-height:1.2; color:${COR.sobreMarca}; text-decoration:none; border-radius:6px; text-align:center;">${texto(m.botao)}</a>
        </td></tr>
      </table>
      <p style="margin:0 0 8px; font-size:14px; line-height:1.5; color:${COR.textoSecundario};">${texto(comum.alternativa)}</p>
      <p style="margin:0 0 24px; font-size:14px; line-height:1.5; word-break:break-all;"><a class="link" href="${link}" style="color:${COR.texto}; text-decoration:underline;">${link}</a></p>
      <p style="margin:0 0 8px; font-size:14px; line-height:1.5; color:${COR.textoSecundario};">${texto(comum.validade)}</p>
      <p style="margin:0; font-size:14px; line-height:1.5; color:${COR.textoSecundario};">${texto(m.seNaoPediu)}</p>
    </td></tr>
    <tr><td class="rodape" align="center" style="padding:20px 32px 0;">
      <p style="margin:0; font-family:${corpo}; font-size:12px; line-height:1.5; color:${COR.textoSecundario};">${texto(comum.rodape)}</p>
    </td></tr>
  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>
`;
}
