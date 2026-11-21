import { z } from "zod";
import { celularValido, cpfValido, nomeValido, soDigitos } from "@/lib/brasil/documentos";

// Bordas do PROpass (MIG-55; PDD v206 §10.4.3). O profissional preenche tudo; a clínica só deu o e-mail (decisão do
// dono, 20/11). CPF e WhatsApp só no corpo da server action, nunca na URL.

/** Lista única de conselhos aceitos (PDD §10.4.3), com os valores do `p_council` do Backend 4. */
export const CONSELHOS = ["crm", "cro", "crbm", "coren", "crefito", "crn", "cfp", "esteticista_ou_equivalente"] as const;
export type Conselho = (typeof CONSELHOS)[number];

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export const dadosSchema = z.object({
  // sem "{{" nem "}}": o texto do termo usa esses marcadores, e o servidor recusaria (Segurança, revisão do #240)
  nome: z.string().trim().refine(nomeValido).refine((n) => !n.includes("{{") && !n.includes("}}")),
  cpf: z.string().transform(soDigitos).refine(cpfValido),
  whatsapp: z.string().transform(soDigitos).refine(celularValido),
  conselho: z.enum(CONSELHOS),
  numero: z.string().transform(soDigitos).pipe(z.string().regex(/^\d{1,10}$/)),
  uf: z.enum(UFS),
});

export type CampoDosDados = keyof z.input<typeof dadosSchema>;
export type DadosDoProfissional = z.input<typeof dadosSchema>;

/** O que a tela recebe ao conferir o conselho. Só a situação: CPF e WhatsApp não voltam. */
/** pedirSenha: o passo 2 do servidor (identidade) diz se a pessoa cria a senha ou usa a que já tem no Boarding Check. */
export type ConferenciaDoConselho =
  | { situacao: "regularizado"; consultadoEm: string; pedirSenha: boolean } // ISO 8601
  | { situacao: "nao_confere" }
  | { situacao: "nao_consultado"; pedirSenha: boolean }
  | { situacao: "link_sem_validade" };

/** PIN óbvio (decisão do CTO, R12): quatro dígitos iguais ou sequência de 4, crescente (0123–6789) ou decrescente
 * (9876–3210). A regra vale no servidor (Backend 4) e se repete aqui. */
export function pinObvio(pin: string): boolean {
  if (/^(\d)\1{3}$/.test(pin)) return true;
  const d = [...pin].map(Number);
  const passo = d[1]! - d[0]!;
  return Math.abs(passo) === 1 && d.every((n, i) => i === 0 || n - d[i - 1]! === passo);
}

export const pinSchema = z.string().regex(/^\d{4}$/).refine((p) => !pinObvio(p));

/** PNG do quadro de assinatura, como data URL. Até ~300 KB: o quadro tem tamanho fixo e traço fino. */
export const assinaturaSchema = z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/).max(400_000);

const instante = z.iso.datetime({ offset: true });

export const envioSchema = z.object({
  dados: dadosSchema,
  assinatura: assinaturaSchema,
  leuAteOFim: z.literal(true),
  /** null quando o profissional já tem a senha (o passo 2 disse para usar a que já tem). */
  pin: pinSchema.nullable(),
  /** "Leia até o fim": quando o termo apareceu e quando a leitura terminou, na ordem, e não no futuro. */
  leitura: z
    .object({ abertoEm: instante, rolagemCompletaEm: instante })
    .refine((l) => Date.parse(l.abertoEm) <= Date.parse(l.rolagemCompletaEm) && Date.parse(l.rolagemCompletaEm) <= Date.now() + 60_000),
});

export type TermoNaTela = { titulo: string; paragrafos: string[] };
export type TermoCarregado = { situacao: "pronto"; termo: TermoNaTela } | { situacao: "link_sem_validade" };
export type DesfechoNaTela =
  | { status: "ok" }
  | { status: "recusado" }
  | { status: "link_sem_validade" }
  | { status: "limite" }
  | { status: "senha_invalida"; motivo: "obvio" | "formato" | "outro" };
