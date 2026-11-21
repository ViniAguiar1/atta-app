import type { Resultado } from "@/lib/errors";
import type { RespostaVerificacao } from "@/server/verificacao/verificar";
import { dataDaAssinatura } from "../formatos";
import { ESTADOS, TIPOS, textos } from "../textos";

// Resultado da verificação (PDD §18.6; simulador, capturas 54 e 55): existência, momento da assinatura, estabelecimento
// e integridade, sem conteúdo nem dado pessoal. Inexistente e malformado são a mesma resposta (exists = false). O
// estabelecimento mostra só o nome (o CNPJ não vem na resposta; ADR 0006 §6, em aberto com o Tech Lead e o CTO).
type Props = { resultado: Resultado<RespostaVerificacao> };

const chip = "inline-flex items-center gap-2 rounded-full bg-surface-card px-3 py-0.5 text-xs font-semibold text-text-primary";

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
      <div role="status" className="flex min-h-11 items-center gap-3 rounded-md border border-border bg-surface-card px-4 py-3 text-corpo">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-status-negative">
          <path d="M12 4 2.5 20h19z" />
          <path d="M12 10v4M12 17h.01" />
        </svg>
        <p>
          <strong>{textos.naoEncontrado}</strong> {textos.naoEncontradoAjuda}
        </p>
      </div>
    );
  }
  const linha = (rotulo: string, valor: React.ReactNode) => (
    <div className="grid grid-cols-1 border-b border-border last:border-b-0 medium:grid-cols-[11.25rem_1fr]">
      <dt className="bg-surface-card px-4 py-3 text-corpo font-medium text-text-primary">{rotulo}</dt>
      <dd className="px-4 py-3 text-corpo text-text-primary">{valor}</dd>
    </div>
  );
  const documento = r.document_type ? (TIPOS[r.document_type] ?? r.document_type) : "";
  const estado = r.status ? (ESTADOS[r.status] ?? r.status) : "";
  return (
    <section aria-label={textos.rotuloResultado}>
      {/* o resultado chega depois do envio: o resumo é anunciado, como o "não encontrado" (WCAG 4.1.3; nota do FE2) */}
      <p role="status" className="sr-only">
        {textos.resumo(documento || textos.existe, estado || "—")}
      </p>
      <dl className="overflow-hidden rounded-md border border-border bg-surface-raised">
        {linha(
          textos.linhas.documento,
          <span className="flex flex-wrap items-center gap-2">
            <span className={chip}>
              <span aria-hidden="true" className="size-1.5 rounded-full bg-text-primary" />
              {textos.existe}
            </span>
            {documento || null}
          </span>,
        )}
        {linha(
          textos.linhas.estado,
          r.status && (
            <span className={chip}>
              <span aria-hidden="true" className="size-1.5 rounded-full bg-text-primary" />
              {estado}
            </span>
          ),
        )}
        {linha(textos.linhas.assinatura, r.signed_at ? dataDaAssinatura(r.signed_at) : null)}
        {linha(textos.linhas.estabelecimento, r.tenant_trade_name)}
        {linha(
          textos.linhas.integridade,
          r.evidence_sha256 && (
            <span className="text-xs break-all font-codigo">{textos.shaDaEvidencia(r.evidence_sha256)}</span>
          ),
        )}
      </dl>
    </section>
  );
}
