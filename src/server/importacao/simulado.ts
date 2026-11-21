import "server-only";
import { randomUUID } from "node:crypto";
import { falha, ok } from "@/lib/errors";
import { analisarPlanilha, LIMITE_BYTES } from "./planilha";
import type { PortaImportacao } from "./porta";

/**
 * Porta simulada (prévia, local e CI): sem estado, porque na Vercel cada chamada pode cair numa instância diferente.
 * O cenário vem do id da importação: arquivo com menos de 1 KB é "fora do modelo" (um .xlsx de verdade é maior). A
 * prévia passa uma planilha fictícia (CPFs gerados, nomes inventados) pela mesma validação da real.
 */
const PREFIXO_FORA = "sim-fora-do-modelo-";
/** Mensagem em português e sem dado (ADR 0001 §5); a tela reconhece o caso pelo campo "arquivo". */
export const FORA_DO_MODELO = "A planilha está fora do modelo. Baixe o modelo de novo e preencha a aba Pacientes.";
const HOJE = new Date("2026-11-21T12:00:00Z");

// planilha fictícia: 6 linhas que cobrem os casos do PDD §10.1 (CPFs gerados, válidos só pelo dígito)
const CABECALHO = ["Nome completo", "CPF", "Data de nascimento", "Celular", "E-mail"];
const LINHAS = [
  ["Marina Fictícia Souza", "529.982.247-25", "15/03/1990", "(11) 91234-0001", "marina@exemplo.test"],
  ["Pedro Inventado Lima", "1234567890", "32947", "1234", "pedro@exemplo.test"], // CPF sem zero; celular em branco
  ["", "111.444.777-35", "", "", ""],
  ["Ana Simulada Rocha", "529.982.247-24", "", "", ""],
  ["Lia Fictícia Prado", "390.533.447-05", "", "", "nao-e-email"], // e-mail em branco
  ["Lia Fictícia Prado", "390.533.447-05", "", "", "nao-e-email"], // repetida igual
];

const somarDiasUteis = (de: Date, dias: number) => {
  const d = new Date(de);
  while (dias > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) dias--;
  }
  return d.toISOString();
};

export const portaImportacaoSimulada: PortaImportacao = {
  async situacao() {
    return ok({
      subscription_since: "2026-11-01",
      quota_until: "2027-02-01",
      included: { used: 0, total: 2 },
      price_per_import_cents: 3990,
      full_import_price_cents: 3990,
      full_import_contracted: false,
      imports: [
        {
          id: "sim-concluida-1",
          status: "concluida",
          sent_at: "2026-11-10T13:00:00.000Z",
          due_at: somarDiasUteis(new Date("2026-11-10T13:00:00.000Z"), 3),
          summary: { imported: 2, linked_to_network: 1, skipped: 3 },
        },
      ],
    });
  },
  async urlDoModelo() {
    return ok({ url: "/modelos/planilha-de-pacientes.xlsx" });
  },
  async declarar(versao) {
    if (!/^[\w.-]{1,20}$/.test(versao))
      return falha("VALIDACAO", "Confira os campos destacados.", [{ campo: "versao", code: "VALIDACAO" }]);
    return ok({ declaration_id: `sim-declaracao-${randomUUID()}` });
  },
  async iniciarEnvio(declarationId, tamanhoBytes) {
    if (!declarationId.startsWith("sim-declaracao-"))
      return falha("CONFLITO", "Marque a declaração antes de enviar a planilha.");
    if (!Number.isInteger(tamanhoBytes) || tamanhoBytes <= 0 || tamanhoBytes > LIMITE_BYTES)
      return falha("LIMITE", "A planilha passa de 20 MB.");
    const importId = `${tamanhoBytes < 1024 ? PREFIXO_FORA : "sim-"}${randomUUID()}`;
    return ok({ import_id: importId, upload_url: `/api/importacao/simulado?id=${importId}` });
  },
  async previa(importId) {
    if (importId.startsWith(PREFIXO_FORA))
      return falha("VALIDACAO", FORA_DO_MODELO, [{ campo: "arquivo", code: "VALIDACAO" }]);
    const a = analisarPlanilha(["Leia primeiro", "Pacientes"], CABECALHO, LINHAS, HOJE);
    if (!a.ok)
      return a.motivo === "linhas_demais"
        ? falha("LIMITE", "A planilha passa do limite de linhas.")
        : falha("VALIDACAO", FORA_DO_MODELO, [{ campo: "arquivo", code: "VALIDACAO" }]);
    return ok({ total: a.total, valid: a.validos.length, errors: a.errors, blanked: a.blanked });
  },
  async confirmar() {
    return ok({ status: "processando" as const, due_at: somarDiasUteis(HOJE, 3) });
  },
  async resultado() {
    const a = analisarPlanilha(["Pacientes"], CABECALHO, LINHAS, HOJE);
    if (!a.ok) return falha("INTERNO", "Não foi possível ler o resultado.");
    // na simulação, a primeira válida já estava na rede e as outras são CPF novo
    return ok({
      imported: a.validos.length - 1,
      linked_to_network: 1,
      already_in_clinic: 0,
      skipped: a.errors,
      blanked: a.blanked.length,
    });
  },
};
