import { TituloDoPasso } from "@/components/ui/TituloDoPasso";
import { TEXTOS } from "../textos";

// Passo 4 do PROpass: Como você recebe documentos (PDD §10.4.3: mini-explicação de que não há login nem painel, só o
// link de cada atendimento pelo WhatsApp). Os downloads em PDF (dados e termo assinado) entram no PR seguinte.
export function PassoConcluido() {
  return (
    <section className="flex flex-col gap-4">
      <p className="text-base font-medium uppercase tracking-wide text-text-secondary">{TEXTOS.passo4}</p>
      <TituloDoPasso>{TEXTOS.concluidoTitulo}</TituloDoPasso>
      <p>{TEXTOS.concluidoTexto}</p>
      <p className="rounded-md border border-border-functional px-4 py-3">{TEXTOS.aguardandoConferencia}</p>
    </section>
  );
}
