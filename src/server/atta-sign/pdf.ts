/**
 * PDFs do ATTA Sign (MIG-21; PDD v206 §10.4.3, "Download em PDF"; desenho do MIG-21, Decisão 4): pdf-lib, sem
 * Chromium, na rota Node. A saída é determinística: as datas do PDF vêm do documento (o momento da assinatura ou do
 * envio), nunca do relógio, e nada aleatório entra no arquivo. O texto vai na fonte padrão Helvetica (WinAnsi): o que
 * ela não desenha (a seta "→" do termo, por exemplo) vira um equivalente ASCII só na imagem da página. O que tem valor de
 * prova é o payload assinado (hash, Código ATTA e selo), e não a página, que cita os dois para a verificação pública.
 */
import "server-only";
import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";

const A4: [number, number] = [595.28, 841.89];
const MARGEM = 56;
const CORPO = 10.5;
const ENTRELINHA = 15;
const CINZA = rgb(0.35, 0.35, 0.35);
const EQUIVALENTES: Record<string, string> = { "→": "->", "←": "<-", "≥": ">=", "≤": "<=", " ": " " };
export const VERIFICACAO = "verify.attahub.com.br"; // PDD §10.4.3 (verificação pública do Código ATTA)

/** Troca, só na imagem da página, o que a fonte padrão não desenha. Nunca lança por um caractere. */
function desenhavel(fonte: PDFFont, texto: string): string {
  return Array.from(texto, (c) => {
    const troca = EQUIVALENTES[c];
    if (troca !== undefined) return troca;
    try {
      fonte.encodeText(c);
      return c;
    } catch {
      return "?";
    }
  }).join("");
}

function quebrar(fonte: PDFFont, tamanho: number, texto: string, largura: number): string[] {
  const linhas: string[] = [];
  for (const paragrafo of texto.split("\n")) {
    if (paragrafo.trim() === "") {
      linhas.push("");
      continue;
    }
    let atual = "";
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura || !atual) atual = tentativa;
      else {
        linhas.push(atual);
        atual = palavra;
      }
    }
    linhas.push(atual);
  }
  return linhas;
}

type Bloco = Readonly<{ texto: string; negrito?: boolean; tamanho?: number; cinza?: boolean }>;

async function montar(titulo: string, quando: Date, blocos: readonly Bloco[], rodape: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(titulo, { showInWindowTitleBar: true });
  pdf.setProducer("ATTA Sign");
  pdf.setCreator("ATTA");
  pdf.setCreationDate(quando);
  pdf.setModificationDate(quando);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const largura = A4[0] - 2 * MARGEM;
  let pagina: PDFPage = pdf.addPage(A4);
  let y = A4[1] - MARGEM;
  const novaPagina = () => {
    pagina = pdf.addPage(A4);
    y = A4[1] - MARGEM;
  };
  for (const b of blocos) {
    const fonte = b.negrito ? negrito : normal;
    const tamanho = b.tamanho ?? CORPO;
    for (const linha of quebrar(fonte, tamanho, desenhavel(fonte, b.texto), largura)) {
      if (y < MARGEM + 2 * ENTRELINHA) novaPagina();
      if (linha) pagina.drawText(linha, { x: MARGEM, y, size: tamanho, font: fonte, color: b.cinza ? CINZA : rgb(0, 0, 0) });
      y -= tamanho > CORPO ? tamanho + 6 : ENTRELINHA;
    }
    y -= 4;
  }
  const textoDoRodape = desenhavel(normal, rodape);
  const paginas = pdf.getPages();
  paginas.forEach((p, i) => {
    const linhas = quebrar(normal, 7.5, `${textoDoRodape} · página ${i + 1} de ${paginas.length}`, largura);
    linhas.forEach((l, j) => p.drawText(l, { x: MARGEM, y: MARGEM - 20 - j * 10, size: 7.5, font: normal, color: CINZA }));
  });
  return pdf.save({ useObjectStreams: false });
}

export type DadosDoPdfDoTermo = Readonly<{
  texto: string; // o texto preenchido (preencherTermo), exatamente o que o profissional leu
  codigoAtta: string;
  evidenceSha256: string;
  assinadoEm: string; // ISO UTC com ms, o signature.signed_at do payload
  signatario: string; // nome e registro, como no payload
}>;

/** O Termo de Autorização na versão selada (PDD §10.4.3): o texto, o Código ATTA, o hash e onde verificar. */
export function gerarPdfDoTermo(d: DadosDoPdfDoTermo): Promise<Uint8Array> {
  const [titulo, ...resto] = d.texto.split("\n");
  return montar(
    titulo ?? "Termo de Autorização",
    new Date(d.assinadoEm),
    [
      { texto: titulo ?? "", negrito: true, tamanho: 13 },
      { texto: resto.join("\n").replace(/^\n+/, "") },
      { texto: "Assinatura eletrônica (ATTA Sign)", negrito: true },
      { texto: `Assinado por ${d.signatario} em ${d.assinadoEm} (UTC).` },
      { texto: `Código ATTA: ${d.codigoAtta}` },
      { texto: `Resumo criptográfico (SHA-256) do registro assinado: ${d.evidenceSha256}`, cinza: true },
      { texto: `Para conferir a existência, o momento da assinatura e a integridade, acesse ${VERIFICACAO} e informe o Código ATTA.`, cinza: true },
    ],
    `ATTA Sign · Código ATTA ${d.codigoAtta} · ${VERIFICACAO}`,
  );
}

export type DadosDoPdfDosDados = Readonly<{
  clinica: string;
  enviadoEm: string; // ISO UTC com ms, o propass_completed_at
  campos: readonly (readonly [rotulo: string, valor: string])[];
}>;

/**
 * A cópia dos dados que o profissional preencheu no PROpass (PDD §10.4.3), montada na hora e nunca guardada. Não é
 * documento assinado e não leva selo. CPF e WhatsApp vão completos: é a cópia do titular (decisão do CTO, 21/11).
 */
export function gerarPdfDosDados(d: DadosDoPdfDosDados): Promise<Uint8Array> {
  return montar(
    "Meus dados no PROpass",
    new Date(d.enviadoEm),
    [
      { texto: "Meus dados no PROpass", negrito: true, tamanho: 13 },
      { texto: `Cópia dos dados que você preencheu na homologação para ${d.clinica}, enviados em ${d.enviadoEm} (UTC).`, cinza: true },
      ...d.campos.flatMap(([rotulo, valor]) => [{ texto: rotulo, negrito: true }, { texto: valor }]),
      { texto: "Esta cópia é sua. Se algum dado mudar, avise a clínica.", cinza: true },
    ],
    "ATTA · cópia dos dados do PROpass",
  );
}
