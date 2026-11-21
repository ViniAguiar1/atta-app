"use client";


import { CartaoDeSecao } from "@/components/ui/CartaoDeSecao";
import { DataState } from "@/components/ui/DataState";
import { FaixaInformativa } from "@/components/ui/FaixaInformativa";
import { FluxoDeImportacao, type AcoesDaImportacao } from "@/components/importacao/FluxoDeImportacao";
import { textosDaImportacao as t } from "@/components/importacao/textos";
import type { SituacaoDaImportacao } from "@/components/importacao/tipos";
import type { Resultado } from "@/lib/errors";

// Configurações › Importação de pacientes (Simulador ATTA-in, captura 48; PDD v206 §10.1 por cima, PLANO "Importação de
// pacientes, MIG-34"; decisão do CTO de 21/11: o fluxo é o mesmo componente do módulo Pacientes). A faixa "Quem importa",
// o cartão da planilha modelo com a cota e os preços da API, e o cartão da importação completa, só informativo: contratar
// a completa é outro item (Tech Lead, 21/11), então o botão dela não aparece. Sem a linha de demonstração da captura.

const dataBr = (aaaaMmDd: string) => aaaaMmDd.slice(0, 10).split("-").reverse().join("/");

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-card px-2.5 py-0.5 text-rotulo font-semibold whitespace-nowrap text-text-primary">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-text-secondary" />
      {children}
    </span>
  );
}

// captura 48: o chip da cota mostra a próxima importação incluída; sem cota (usou as 2 ou passou dos 3 meses), não aparece
function proximaIncluida(s: SituacaoDaImportacao, hoje: string): 1 | 2 | null {
  if (hoje.slice(0, 10) > s.quota_until.slice(0, 10) || s.included.used >= s.included.total) return null;
  return s.included.used === 0 ? 1 : 2;
}

function IconeDePlanilha() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 4v10m-4-4 4 4 4-4M5 18h14" />
    </svg>
  );
}

function IconeAtta() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M4 20 11 4l3 7M9 13h10M14.5 13v7" />
    </svg>
  );
}

export function TelaImportacao({
  resultado,
  acoes,
  hoje,
}: {
  /** null enquanto carrega */
  resultado: Resultado<SituacaoDaImportacao> | null;
  acoes: AcoesDaImportacao;
  /** data de hoje (AAAA-MM-DD) no fuso da clínica, para saber se a cota dos 3 meses ainda vale */
  hoje: string;
}) {
  const estado = resultado === null ? { tipo: "carregando" as const } : resultado.ok ? { tipo: "pronto" as const } : { tipo: "erro" as const };
  return (
    <section aria-labelledby="titulo-importacao" className="flex flex-col gap-4">
      <h2 id="titulo-importacao" className="sr-only">
        {t.titulo}
      </h2>
      <FaixaInformativa destaque={t.quem.destaque}>{t.quem.texto}</FaixaInformativa>
      {estado.tipo !== "pronto" || !resultado?.ok ? (
        <DataState
          estado={estado.tipo === "carregando" ? { tipo: "carregando" } : { tipo: "erro", codigo: resultado && !resultado.ok ? resultado.error.code : undefined, tentarDeNovo: () => window.location.reload() }}
          rotulo={t.titulo}
          esqueleto={{ linhas: 2, alturaRem: 12 }}
          vazio={{ titulo: t.titulo }}
        >
          {null}
        </DataState>
      ) : (
        <Cartoes s={resultado.data} acoes={acoes} hoje={hoje} />
      )}
    </section>
  );
}

function Cartoes({ s, acoes, hoje }: { s: SituacaoDaImportacao; acoes: AcoesDaImportacao; hoje: string }) {
  const proxima = proximaIncluida(s, hoje);
  return (
    <>
      <CartaoDeSecao titulo={t.modelo.titulo} subtitulo={t.modelo.subtitulo} icone={<IconeDePlanilha />}>
        <div className="flex flex-wrap gap-2">
          {proxima && <Chip>{t.modelo.incluida(proxima)}</Chip>}
          <Chip>{t.modelo.porImportacao(s.price_per_import_cents)}</Chip>
          <Chip>{t.modelo.feitaPelaAtta(s.full_import_price_cents)}</Chip>
        </div>
        <p className="text-corpo text-text-primary">
          {t.modelo.texto(dataBr(s.subscription_since), dataBr(s.quota_until), s.price_per_import_cents, s.full_import_price_cents)}
        </p>
        <FluxoDeImportacao acoes={acoes} />
      </CartaoDeSecao>
      <CartaoDeSecao titulo={t.completa.titulo} subtitulo={t.completa.subtitulo} icone={<IconeAtta />}>
        <div className="flex flex-wrap gap-2">
          {s.full_import_contracted ? (
            <Chip>{t.completa.contratada}</Chip>
          ) : (
            <>
              <Chip>{t.completa.pagamentoUnico(s.full_import_price_cents)}</Chip>
              <Chip>{t.completa.mensalidade}</Chip>
            </>
          )}
        </div>
        <p className="text-corpo text-text-primary">{t.completa.texto(s.full_import_price_cents)}</p>
      </CartaoDeSecao>
    </>
  );
}
