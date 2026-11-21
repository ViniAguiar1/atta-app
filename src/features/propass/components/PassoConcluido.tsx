import Link from "next/link";
import { TituloDoPasso } from "@/components/ui/TituloDoPasso";
import { TEXTOS } from "../textos";

// Passo 4 do PROpass: Como você recebe documentos (PDD §10.4.3: mini-explicação de que não há login nem painel, só o
// link de cada atendimento pelo WhatsApp), o Código ATTA do Termo e a divisão de responsabilidade depois do PROpass. Os
// downloads em PDF (dados e termo assinado) entram no PR seguinte.
type Props = {
  /** Código ATTA do Termo assinado agora (#303): público por desenho, confere na verificação pública (§18). */
  codigoAtta: string;
  senhaExistente?: boolean;
};

export function PassoConcluido({ codigoAtta, senhaExistente = false }: Props) {
  return (
    <section className="flex flex-col gap-4">
      <p className="text-base font-medium uppercase tracking-wide text-text-secondary">{TEXTOS.passo4}</p>
      <TituloDoPasso>{TEXTOS.concluidoTitulo}</TituloDoPasso>
      <section aria-labelledby="propass-codigo" className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-raised px-4 py-3">
        <h2 id="propass-codigo" className="text-base text-text-secondary">
          {TEXTOS.codigoRotulo}
        </h2>
        <p className="font-codigo text-xl tracking-wide text-text-primary">{codigoAtta}</p>
        <p className="text-base">{TEXTOS.codigoAjuda}</p>
        <Link href={`/verificar/${encodeURIComponent(codigoAtta)}`} className="text-base font-medium text-brand underline">
          {TEXTOS.codigoLink}
        </Link>
      </section>
      <p>{TEXTOS.concluidoTexto}</p>
      {senhaExistente && <p>{TEXTOS.senhaExistente}</p>}
      <p className="rounded-md border border-border-functional px-4 py-3">{TEXTOS.aguardandoConferencia}</p>
      {/* PDD §10.4.3: a divisão de responsabilidade "fica declarada na própria tela do PROpass" (decisão da PO) */}
      <section aria-labelledby="propass-responsabilidades" className="flex flex-col gap-2">
        <h2 id="propass-responsabilidades" className="font-medium">
          {TEXTOS.responsabilidadesTitulo}
        </h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          {TEXTOS.responsabilidades.map((frase) => (
            <li key={frase}>{frase}</li>
          ))}
        </ul>
      </section>
    </section>
  );
}
