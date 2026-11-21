import { CartaoDeSecao } from "@/components/ui/CartaoDeSecao";
import { FaixaInformativa } from "@/components/ui/FaixaInformativa";
import { textos } from "../textos";

const t = textos.solucoes;

// Soluções ATTA (PDD v206 §10.6.5) no layout da captura 23. Por ora vale o simulador: a faixa "Em breve" e o card do
// ATTA me. Os cards do ATTA Clinic e do ATTA Pro do PDD voltam quando a PO der o destino de "ver demonstração" e o
// WhatsApp do consultor (CTO, 20/11): botão sem destino não entra.
export function TelaSolucoes() {
  return (
    <div className="flex flex-col gap-3">
      <FaixaInformativa destaque={t.faixa.destaque}>{t.faixa.texto}</FaixaInformativa>
      <CartaoDeSecao titulo={t.proximo.titulo} subtitulo={t.proximo.subtitulo} icone="📋">
        <ul className="grid gap-4 expanded:grid-cols-3">
          <li className="flex flex-col gap-3 rounded-md border border-border p-4">
            <div className="flex flex-col gap-2.5 bg-brand px-4.5 py-5 text-on-brand">
              <p className="flex items-baseline gap-1.5 leading-none">
                <span className="sr-only">{t.attaMe.rotuloFalado}</span>
                <span aria-hidden="true" className="font-atta text-marca tracking-wide">{t.attaMe.nome}</span>
                <span aria-hidden="true" className="font-product text-lg">{t.attaMe.sufixo}</span>
              </p>
              <p className="text-xs tracking-wider uppercase">{t.attaMe.tipo}</p>
            </div>
            <p className="px-4.5 text-base">{t.attaMe.texto}</p>
            <p className="px-4.5 pb-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-card px-2.5 py-1 text-xs font-medium">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-text-tertiary" />
                {t.attaMe.chip}
              </span>
            </p>
          </li>
        </ul>
      </CartaoDeSecao>
    </div>
  );
}
