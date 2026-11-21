import { CartaoDeSecao } from "@/components/ui/CartaoDeSecao";
import { FaixaInformativa } from "@/components/ui/FaixaInformativa";
import { textosAjuda as t } from "../textos-ajuda";

// Central de Ajuda (PDD v206 §10.6.1) no layout da captura 19. Os guias são cartões de leitura: o artigo de cada um
// entra com o conteúdo da PO (sem link até lá: botão ou link sem destino não entra). O FAQ abre e fecha pelo
// <details> nativo, que já é acessível pelo teclado e pelo leitor de tela.
export function TelaAjuda() {
  return (
    <div className="flex flex-col gap-3">
      <FaixaInformativa destaque={t.faixa.destaque}>{t.faixa.texto}</FaixaInformativa>
      <CartaoDeSecao titulo={t.guias.titulo} subtitulo={t.guias.subtitulo} icone="📚">
        <ul className="grid grid-cols-2 gap-2.5 medium:grid-cols-3 expanded:grid-cols-4 large:grid-cols-7">
          {t.guias.itens.map((g) => (
            <li key={g.titulo} className="flex min-h-36 flex-col gap-3 rounded-md border border-border p-4.5">
              <h3 className="font-title text-[1.25rem] leading-tight">{g.titulo}</h3>
              <p className="text-[0.8125rem] text-text-secondary">{g.texto}</p>
            </li>
          ))}
        </ul>
      </CartaoDeSecao>
      <CartaoDeSecao titulo={t.faq.titulo} subtitulo={t.faq.subtitulo} icone="💬" semPreenchimento>
        <ul>
          {t.faq.itens.map((item) => (
            <li key={item.p} className="border-b border-border last:border-b-0">
              <details className="group">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-[0.8125rem] font-medium [&::-webkit-details-marker]:hidden">
                  <span>{item.p}</span>
                  <svg
                    viewBox="0 0 24 24"
                    className="size-4 shrink-0 text-text-secondary transition-transform group-open:rotate-180"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </summary>
                <p className="px-4 pb-4 text-[0.8125rem] text-text-secondary">{item.r}</p>
              </details>
            </li>
          ))}
        </ul>
      </CartaoDeSecao>
    </div>
  );
}
