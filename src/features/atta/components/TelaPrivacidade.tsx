import { CardDeResumo } from "@/components/ui/CardDeResumo";
import { CartaoDeSecao } from "@/components/ui/CartaoDeSecao";
import { FaixaInformativa } from "@/components/ui/FaixaInformativa";
import type { ResumoDosDados } from "@/server/atta/porta";
import { textos } from "../textos";
import { IconeCamadas, IconeConferido, IconeDocumento, IconeLista } from "./icones";

const t = textos.privacidade;
const c = t.transparencia.categorias;

// Privacidade & Dados (LGPD), PDD v206 §10.6.3, no layout da captura 21. Sem toggle de consentimento aqui: fica em
// Configurações › Termos & Políticas (CTO, 20/11). Requisições de titular sem formulário até a API existir (Backend 3):
// botão sem destino não entra.
export function TelaPrivacidade({ clinica, resumo }: { clinica: string | null; resumo: ResumoDosDados }) {
  const categorias = [
    { ...c.clinica, numeros: c.clinica.numeros(resumo.membros, resumo.procedimentos, resumo.modelos) },
    { ...c.pacientes, numeros: c.pacientes.numeros(resumo.pacientes, resumo.documentosAssinados) },
    { ...c.saude, numeros: c.saude.numeros(resumo.respostasDeSaude) },
    { ...c.logs, numeros: c.logs.numeros(resumo.registrosDeAuditoria) },
  ];
  return (
    <div className="flex flex-col gap-4">
      <FaixaInformativa destaque={t.faixa.destaque}>{t.faixa.texto(clinica)}</FaixaInformativa>
      <div className="grid gap-3 px-0 medium:grid-cols-2 large:grid-cols-4 large:px-5 large:pt-4">
        <CardDeResumo valor={4} rotulo={t.cards.categorias.rotulo} legenda={t.cards.categorias.legenda} icone={<IconeCamadas />} />
        <CardDeResumo valor={resumo.documentosAssinados} rotulo={t.cards.documentos.rotulo} legenda={t.cards.documentos.legenda} icone={<IconeDocumento />} />
        <CardDeResumo
          valor={resumo.requisicoesDeTitular}
          rotulo={t.cards.requisicoes.rotulo}
          legenda={t.cards.requisicoes.legenda(resumo.requisicoesEmAberto)}
          icone={<IconeLista />}
        />
        <CardDeResumo valor={t.cards.prazo.valor} rotulo={t.cards.prazo.rotulo} legenda={t.cards.prazo.legenda} icone={<IconeConferido />} />
      </div>
      <CartaoDeSecao titulo={t.transparencia.titulo} subtitulo={t.transparencia.subtitulo} icone="🔍">
        <ul className="grid gap-4 expanded:grid-cols-2">
          {categorias.map((cat) => (
            <li key={cat.titulo} className="flex flex-col gap-0.5 rounded-md border border-border px-4 py-3.5">
              <h3 className="text-[0.9375rem] font-medium">{cat.titulo}</h3>
              <p className="text-[0.8125rem] text-text-secondary">{cat.texto}</p>
              <p className="mt-1 text-[0.9375rem] font-semibold">{cat.numeros}</p>
              <p className="mt-0.5 text-[0.8125rem] text-text-secondary">{cat.base}</p>
            </li>
          ))}
        </ul>
      </CartaoDeSecao>
      <CartaoDeSecao titulo={t.prazos.titulo} subtitulo={t.prazos.subtitulo} icone="⚖️" semPreenchimento>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t.prazos.titulo}</caption>
            <thead className="text-xs font-medium tracking-wide text-text-secondary uppercase">
              <tr className="border-b border-border">
                <th scope="col" className="px-4 py-3">{t.prazos.colunas.dado}</th>
                <th scope="col" className="px-4 py-3">{t.prazos.colunas.prazo}</th>
                <th scope="col" className="px-4 py-3">{t.prazos.colunas.base}</th>
              </tr>
            </thead>
            <tbody>
              {t.prazos.linhas.map((l) => (
                <tr key={l.dado} className="border-b border-border align-top last:border-b-0">
                  <th scope="row" className="px-4 py-3 font-medium">{l.dado}</th>
                  <td className="px-4 py-3 text-text-secondary">{l.prazo}</td>
                  <td className="px-4 py-3 text-text-secondary">{l.base}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CartaoDeSecao>
      <CartaoDeSecao titulo={t.consentimento.titulo} subtitulo={t.consentimento.subtitulo} icone="✅" texto={t.consentimento.texto} />
      <CartaoDeSecao titulo={t.requisicoes.titulo} subtitulo={t.requisicoes.subtitulo} icone="📨" texto={t.requisicoes.vazio} />
    </div>
  );
}
