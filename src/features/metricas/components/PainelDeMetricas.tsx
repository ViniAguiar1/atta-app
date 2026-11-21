import { CardDeResumo, TRAVESSAO } from "@/components/ui/CardDeResumo";
import { CartaoDeSecao } from "@/components/ui/CartaoDeSecao";
import { FaixaInformativa } from "@/components/ui/FaixaInformativa";
import { contagem, duracao, extras, horas, percentual } from "../formato";
import type { PainelDeMetricas as Dados } from "../schema";
import { textos } from "../textos";

// Painel de Métricas (MIG-46; PDD v206 §10.5), como o Simulador ATTA-in (captura 40): a faixa do que se mede, os 4 cards
// de KPI (§10.5.1), a Taxa de Preparação Prévia, os Tempos de hoje e os cartões dos gráficos (§10.5.2). Os números
// chegam prontos da porta; sem número, "—", nunca dado de mentira. Ficam para depois: o "Antes × depois" (depende do
// baseline do onboarding, §10.5.5), o filtro por profissional e procedimento (§10.5) e as séries dos gráficos (MIG-16).

const t = textos;

export function PainelDeMetricas({ dados }: { dados: Dados }) {
  const hoje = duracao(dados.tempoMedioCheckin.hojeSegundos);
  return (
    <div className="flex flex-col gap-4">
      <FaixaInformativa>{t.faixa}</FaixaInformativa>
      {dados.atendimentosValidosHoje !== null && (
        <p className="-mt-2 text-[0.8125rem] text-text-secondary">{t.validosHoje(dados.atendimentosValidosHoje)}</p>
      )}

      <section aria-label={t.cards.rotulo} className="grid grid-cols-1 gap-4 medium:grid-cols-2 large:grid-cols-4">
        <CardDeResumo
          valor={duracao(dados.tempoMedioCheckin.mediaSegundos)}
          rotulo={t.cards.tempoMedio}
          icone={<IconeRelogio />}
          legenda={t.cards.tempoMedioLegenda(hoje)}
        />
        <CardDeResumo valor={horas(dados.tempoOperacionalSalvoHoras)} rotulo={t.cards.tempoSalvo} icone={<IconeAmpulheta />} legenda={t.cards.tempoSalvoLegenda} />
        <CardDeResumo valor={extras(dados.atendimentosExtrasMes)} rotulo={t.cards.extras} icone={<IconeTendencia />} legenda={t.cards.extrasLegenda} />
        <CardDeResumo
          valor={contagem(dados.documentosAssinadosMes)}
          rotulo={t.cards.documentos}
          icone={<IconeDocumento />}
          legenda={t.cards.documentosLegenda(contagem(dados.formulariosDeSaudeMes))}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 large:grid-cols-2">
        <CartaoDeSecao titulo={t.preparacao.titulo} subtitulo={t.preparacao.subtitulo} icone={<IconeAlvo />}>
          {dados.preparacaoPrevia ? (
            <div className="flex flex-col gap-1 px-5 py-4">
              <span className="font-sub text-[2.25rem] leading-none text-text-primary">
                {percentual(dados.preparacaoPrevia.prontos, dados.preparacaoPrevia.total)}
              </span>
              <span className="text-[0.8125rem] text-text-secondary">{t.preparacao.detalhe(dados.preparacaoPrevia.prontos, dados.preparacaoPrevia.total)}</span>
            </div>
          ) : (
            <p className="text-[0.8125rem] text-text-secondary">{t.preparacao.vazio}</p>
          )}
        </CartaoDeSecao>

        <CartaoDeSecao titulo={t.tempos.titulo} subtitulo={t.tempos.subtitulo} icone={<IconeCronometro />}>
          <dl className="grid grid-cols-1 gap-3 medium:grid-cols-3">
            <Tempo rotulo={t.tempos.checkin} valor={duracao(dados.temposDeHoje.checkinSegundos)} legenda={t.tempos.checkinLegenda} tom="bg-status-checkin/15" />
            <Tempo rotulo={t.tempos.recepcao} valor={duracao(dados.temposDeHoje.recepcaoSegundos)} legenda={t.tempos.recepcaoLegenda} tom="bg-status-checkin/20" />
            <Tempo
              rotulo={t.tempos.mediana}
              valor={duracao(dados.temposDeHoje.medianaSegundos)}
              legenda={t.tempos.p90(duracao(dados.temposDeHoje.p90Segundos))}
              tom="bg-surface-card"
            />
          </dl>
        </CartaoDeSecao>

        <CartaoDeSecao titulo={t.graficos.tendencia.titulo} subtitulo={t.graficos.tendencia.subtitulo} icone={<IconeGrafico />}>
          <p className="text-[0.8125rem] text-text-secondary">{t.graficos.vazio}</p>
        </CartaoDeSecao>
        <CartaoDeSecao titulo={t.graficos.extrasPorMes.titulo} subtitulo={t.graficos.extrasPorMes.subtitulo} icone={<IconeGrafico />}>
          <p className="text-[0.8125rem] text-text-secondary">{t.graficos.vazio}</p>
        </CartaoDeSecao>
      </div>
    </div>
  );
}

function Tempo({ rotulo, valor, legenda, tom }: { rotulo: string; valor: string | null; legenda: string; tom: string }) {
  return (
    <div className={`flex flex-col gap-1 rounded-md p-3 ${tom}`}>
      <dt className="text-[0.6875rem] font-medium tracking-wide text-text-secondary uppercase">{rotulo}</dt>
      <dd className="font-sub text-[1.375rem] leading-tight text-text-primary">{valor ?? TRAVESSAO}</dd>
      <dd className="text-xs text-text-secondary">{legenda}</dd>
    </div>
  );
}

// Ícones de traço fino (Guia de Design §7), decorativos (o CardDeResumo e o CartaoDeSecao põem aria-hidden).
const traco = { viewBox: "0 0 24 24", className: "size-4", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", focusable: "false" } as const;

function IconeRelogio() {
  return (
    <svg {...traco}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}
function IconeAmpulheta() {
  return (
    <svg {...traco}>
      <path d="M7 3.5h10M7 20.5h10M8 3.5c0 4 8 5 8 8.5s-8 4.5-8 8.5M16 3.5c0 4-8 5-8 8.5s8 4.5 8 8.5" />
    </svg>
  );
}
function IconeTendencia() {
  return (
    <svg {...traco}>
      <path d="M3.5 16.5 9 11l4 4 7.5-7.5M15 7.5h5.5V13" />
    </svg>
  );
}
function IconeDocumento() {
  return (
    <svg {...traco}>
      <path d="M14 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8L14 3.5Z" />
      <path d="M14 3.5V8h4.5M9 14l2 2 4-4" />
    </svg>
  );
}
function IconeAlvo() {
  return (
    <svg {...traco}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  );
}
function IconeCronometro() {
  return (
    <svg {...traco}>
      <circle cx="12" cy="13.5" r="7" />
      <path d="M12 10v3.5l2 1.5M10 3.5h4M12 3.5v3" />
    </svg>
  );
}
function IconeGrafico() {
  return (
    <svg {...traco}>
      <path d="M4 4.5v15h16M7.5 15l3.5-4 3 2.5 4.5-5.5" />
    </svg>
  );
}
