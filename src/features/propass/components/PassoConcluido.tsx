import { TituloDoPasso } from "@/components/ui/TituloDoPasso";
import { TEXTOS } from "../textos";

// Passo 4 do PROpass: Como você recebe documentos (PDD §10.4.3: mini-explicação de que não há login nem painel, só o
// link de cada atendimento pelo WhatsApp) e a divisão de responsabilidade depois do PROpass. O Código ATTA do Termo e os
// downloads em PDF (dados e termo assinado) entram nos PRs seguintes.
export function PassoConcluido({ senhaExistente = false }: { senhaExistente?: boolean }) {
  return (
    <section className="flex flex-col gap-4">
      <p className="text-base font-medium uppercase tracking-wide text-text-secondary">{TEXTOS.passo4}</p>
      <TituloDoPasso>{TEXTOS.concluidoTitulo}</TituloDoPasso>
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
