// getCofre(domínio): um Cofre por chaveiro, lido e validado uma vez por processo (ADR 0002).
//   health    → ATTA_SAUDE_CHAVE_MESTRA       (Formulário de Saúde)
//   documents → ATTA_DOCUMENTOS_CHAVE_MESTRA  (PDFs do ATTA Sign no Storage)
//   network   → ATTA_REDE_CHAVE_MESTRA        (cpf_enc, rne_enc, phone_enc, email_enc de network.person; ADR 0002 §6)
// Rotas que usam o Cofre declaram `export const runtime = 'nodejs'`.
import "server-only";
import { MasterKeyCofre, parseKeyring } from "./master-key";
import type { Cofre } from "./types";

export type CofreDomain = "health" | "documents" | "network";

export const COFRE_ENV: Readonly<Record<CofreDomain, string>> = {
  health: "ATTA_SAUDE_CHAVE_MESTRA",
  documents: "ATTA_DOCUMENTOS_CHAVE_MESTRA",
  network: "ATTA_REDE_CHAVE_MESTRA",
};

/** Impressão digital da KEK de teste fixa do CI (tests/fixtures/cofre-ci.ts); produção e prévia a recusam. */
export const CI_TEST_KEK_FINGERPRINT = "b43ad417deda943b31e6752385c3a70c6787fdc029d331f3c46cd9884dc2faa1";

const cache = new Map<CofreDomain, Cofre>();

export function getCofre(domain: CofreDomain): Cofre {
  let cofre = cache.get(domain);
  if (!cofre) {
    // a KEK de teste é recusada na nuvem (production e preview; ADR 0002 §1), só vale no CI e no local
    const nuvem = process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview";
    const forbidden = nuvem ? new Set([CI_TEST_KEK_FINGERPRINT]) : new Set<string>();
    cofre = new MasterKeyCofre(parseKeyring(process.env[COFRE_ENV[domain]], forbidden, COFRE_ENV[domain]));
    cache.set(domain, cofre);
  }
  return cofre;
}

export type { Cofre, CofreContext, WrappedKey } from "./types";
