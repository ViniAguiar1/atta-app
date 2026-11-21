import type { Resultado } from "@/lib/errors";
import type { RespostaVerificacao } from "@/server/verificacao/verificar";
import { dataDaAssinatura } from "../formatos";
import { ESTADOS, TIPOS, textos } from "../textos";

// Resultado da verificação (PDD §18.6; simulador, capturas 54 e 55): existência, momento da assinatura, estabelecimento
// e integridade, sem conteúdo nem dado pessoal. Inexistente e malformado são a mesma resposta (exists = false). O
// estabelecimento mostra só o nome (o CNPJ não vem na resposta; ADR 0006 §6, em aberto com o Tech Lead e o CTO).
type Props = { resultado: Resultado<RespostaVerificacao> };

const chip = "inline-flex items-center gap-2 rounded-full bg-surface-card px-3 py-0.5 text-xs font-medium text-text-primary";

export function ResultadoDaVerificacao({ resultado }: Props) {
  if (!resultado.ok) {
    return (
      <p role="alert" className="rounded-md border border-border-functional px-4 py-3 text-corpo">
        {resultado.error.code === "LIMITE" ? textos.limite : textos.indisponivel}
      </p>
    );
  }
  const r = resultado.data;
  if (!r.exists) {
    return (
      <div role="status" className="flex gap-3 rounded-md border border-status-negative/40 bg-status-negative/5 px-4 py-3 text-corpo">
        <span aria-hidden="true" className="text-status-negative">
          ⚠
        </span>
        <p>
          <strong>{textos.naoEncontrado}</strong> {textos.naoEncontradoAjuda}
        </p>
      </div>
    );
  }
  const linha = (rotulo: string, valor: React.ReactNode) => (
    <div className="grid grid-cols-1 border-b border-border last:border-b-0 medium:grid-cols-[11rem_1fr]">
      <dt className="bg-surface-card px-4 py-3 text-corpo font-medium text-text-primary">{rotulo}</dt>
      <dd className="px-4 py-3 text-corpo text-text-primary">{valor}</dd>
    </div>
  );
  return (
    <section aria-label={textos.rotuloResultado}>
      <dl className="overflow-hidden rounded-xl border border-border bg-surface-raised">
        {linha(
          textos.linhas.documento,
          <span className="flex flex-wrap items-center gap-2">
            <span className={chip}>
              <span aria-hidden="true" className="size-1.5 rounded-full bg-text-primary" />
              {textos.existe}
            </span>
            {r.document_type ? (TIPOS[r.document_type] ?? r.document_type) : null}
          </span>,
        )}
        {linha(
          textos.linhas.estado,
          r.status && (
            <span className={chip}>
              <span aria-hidden="true" className="size-1.5 rounded-full bg-text-primary" />
              {ESTADOS[r.status] ?? r.status}
            </span>
          ),
        )}
        {linha(textos.linhas.assinatura, r.signed_at ? dataDaAssinatura(r.signed_at) : null)}
        {linha(textos.linhas.estabelecimento, r.tenant_trade_name)}
        {linha(
          textos.linhas.integridade,
          r.evidence_sha256 && (
            <span className="text-xs break-all [font-family:ui-monospace,monospace]">{textos.shaDaEvidencia(r.evidence_sha256)}</span>
          ),
        )}
      </dl>
    </section>
  );
}
