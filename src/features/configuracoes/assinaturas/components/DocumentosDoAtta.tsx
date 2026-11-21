import { CartaoDeSecao } from "@/components/ui/CartaoDeSecao";
import { textos } from "../textos";

const t = textos.documentosDoAtta;

// "Documentos do ATTA que o paciente assina" (simulador, captura 46; decisão do CTO, R46): só leitura, com o texto do
// simulador conferido com o PDD §16 e §17.2. A tabela descreve a regra, não o estado de cada documento.
export function DocumentosDoAtta() {
  return (
    <CartaoDeSecao nivel={3} titulo={t.titulo} subtitulo={t.subtitulo} icone="📄" texto={t.texto}>
      {/* rola sozinha no celular; focável e com nome para quem usa teclado (axe: scrollable-region-focusable) */}
<div role="region" aria-label={t.legenda} tabIndex={0} className="relative overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-160 text-left">
          <caption className="sr-only">{t.legenda}</caption>
          <thead className="bg-surface-app font-medium">
            <tr className="border-b border-border">
              <th scope="col" className="px-3 py-2.5">{t.colunas.documento}</th>
              <th scope="col" className="px-3 py-2.5">{t.colunas.como}</th>
              <th scope="col" className="px-3 py-2.5">{t.colunas.quando}</th>
              <th scope="col" className="px-3 py-2.5">{t.colunas.validade}</th>
            </tr>
          </thead>
          <tbody>
            {t.linhas.map((l) => (
              <tr key={l.documento} className="border-b border-border align-top last:border-b-0">
                <th scope="row" className="px-3 py-3 font-semibold">
                  {l.documento}
                  {"detalhe" in l && <span className="block text-xs font-normal text-text-secondary">({l.detalhe})</span>}
                </th>
                <td className="px-3 py-3">{l.como}</td>
                <td className="px-3 py-3 text-text-secondary">{l.quando}</td>
                <td className="px-3 py-3">{l.validade}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-text-secondary">{t.nota}</p>
    </CartaoDeSecao>
  );
}
