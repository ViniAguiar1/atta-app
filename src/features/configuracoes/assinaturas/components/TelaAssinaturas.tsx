"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { CartaoDeSecao } from "@/components/ui/CartaoDeSecao";
import { DataState } from "@/components/ui/DataState";
import { FaixaInformativa } from "@/components/ui/FaixaInformativa";
import { Monograma } from "@/components/ui/Monograma";
import type { Resultado } from "@/lib/errors";
import { type Chancela, type ConfiguracaoDeAssinatura, MODELOS, MODELOS_COM_RT, type ModeloDeAssinatura } from "@/server/assinaturas/tipos";
import { salvarModelo } from "../actions";
import { textos as t } from "../textos";

// Configurações › Assinaturas & Validade (PDD v206 §10.4.2; captura 46). Modelo de Assinatura (3 cartões de escolha,
// grava ao escolher; se o servidor recusar, volta ao salvo), Método (ATTA Sign, só texto) e o Preview ao vivo da
// chancela com os dados do Perfil da Clínica. O hash do preview é calculado de verdade, no navegador, sobre o payload
// do preview (decisão do CTO, 21/11); o Código ATTA aparece só no formato, sem QR.
type Props = { resultado: Resultado<ConfiguracaoDeAssinatura | null> | null };

const chip = "inline-flex items-center gap-1.5 rounded-full bg-surface-card px-2.5 py-1 text-xs font-medium";
const ponto = <span aria-hidden="true" className="size-1.5 rounded-full bg-text-secondary" />;

export function TelaAssinaturas({ resultado }: Props) {
  const router = useRouter();
  const [dados, setDados] = useState<ConfiguracaoDeAssinatura | null>(resultado?.ok ? resultado.data : null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [salvando, executar] = useTransition();
  const estado = !resultado
    ? ({ tipo: "carregando" } as const)
    : !resultado.ok
      ? ({ tipo: "erro", tentarDeNovo: () => router.refresh(), codigo: resultado.error.code } as const)
      : !dados
        ? ({ tipo: "vazio" } as const)
        : ({ tipo: "pronto" } as const);

  function escolher(modelo: ModeloDeAssinatura) {
    if (!dados || salvando || modelo === dados.modelo) return;
    const anterior = dados;
    setDados({ ...dados, modelo }); // o preview acompanha na hora
    setSalvo(false);
    executar(async () => {
      const r = await salvarModelo({ modelo });
      if (!r.ok) {
        setDados(anterior);
        return setErro(r.error.code === "SEM_PERMISSAO" ? t.erros.SEM_PERMISSAO : t.erros.outro);
      }
      setErro(null);
      setSalvo(true);
      setDados(r.data);
    });
  }

  return (
    // corpo em 13 px (text-corpo), a escala do painel nas capturas
    <section aria-labelledby="titulo-assinaturas" className="text-corpo">
      <h2 id="titulo-assinaturas" className="sr-only">
        {t.titulo}
      </h2>
      <DataState estado={estado} rotulo={t.estado} esqueleto={{ linhas: 3, alturaRem: 12 }} vazio={t.vazio}>
        {dados && (
          <div className="grid items-start gap-4 large:grid-cols-[minmax(0,1fr)_21rem]">
            <div className="flex flex-col gap-4">
              <CartaoDeSecao nivel={3} titulo={t.modelo.titulo} subtitulo={t.modelo.subtitulo} icone="⚖️">
                <fieldset>
                  <legend className="sr-only">{t.modelo.legenda}</legend>
                  <div className="grid gap-3 expanded:grid-cols-3">
                    {MODELOS.map((m) => {
                      const o = t.modelo.opcoes[m];
                      const marcado = dados.modelo === m;
                      return (
                        <label
                          key={m}
                          className={`flex cursor-pointer flex-col gap-2 rounded-md border bg-surface-raised p-3.5 ${marcado ? "border-text-primary ring-1 ring-text-primary" : "border-border-functional"}`}
                        >
                          <span className="flex items-start justify-between gap-3">
                            <span className={marcado ? "font-semibold" : ""}>{o.nome}</span>
                            <input
                              type="radio"
                              name="modelo-de-assinatura"
                              value={m}
                              checked={marcado}
                              onChange={() => escolher(m)}
                              className="mt-0.5 size-5 shrink-0 cursor-pointer accent-brand"
                            />
                          </span>
                          {o.selos.length > 0 && (
                            <span className="flex flex-wrap gap-1.5">
                              {o.selos.map((s) => (
                                <span key={s} className={chip}>
                                  {ponto}
                                  {s}
                                </span>
                              ))}
                            </span>
                          )}
                          <span>{o.texto}</span>
                          <span className="text-xs text-text-secondary">{o.cenario}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                {!dados.rtCompleto && dados.modelo && MODELOS_COM_RT.includes(dados.modelo) && (
                  <FaixaInformativa destaque={t.semRt.destaque}>{t.semRt.texto}</FaixaInformativa>
                )}
                <p className="text-text-secondary">{t.modelo.rodape}</p>
                {erro && (
                  <p role="alert" className="text-status-negative">
                    {erro}
                  </p>
                )}
                <p role="status" className="sr-only">
                  {salvo ? t.salvo : ""}
                </p>
              </CartaoDeSecao>
              <CartaoDeSecao nivel={3} titulo={t.metodo.titulo} subtitulo={t.metodo.subtitulo} icone="✍️">
                <div className="flex flex-col gap-2 rounded-md border border-text-primary bg-surface-raised p-3.5 ring-1 ring-text-primary">
                  <h4 className="font-semibold">{t.metodo.nome}</h4>
                  <span className="flex flex-wrap gap-1.5">
                    {t.metodo.selos.map((s) => (
                      <span key={s} className={chip}>
                        {ponto}
                        {s}
                      </span>
                    ))}
                  </span>
                  <p>{t.metodo.texto}</p>
                  <p className="text-xs text-text-secondary">{t.metodo.fundamento}</p>
                </div>
              </CartaoDeSecao>
            </div>
            <div className="large:sticky large:top-4">
              <CartaoDeSecao nivel={3} titulo={t.preview.titulo} subtitulo={t.preview.subtitulo} icone="✍️">
                <Selo chancela={dados.chancela} modelo={dados.modelo} />
              </CartaoDeSecao>
            </div>
          </div>
        )}
      </DataState>
    </section>
  );
}

/** "CRM-SP 000000"; o que faltar sai, e sem nada vira null */
const conselhoDoRt = (rt: Chancela["rt"]) =>
  rt && rt.conselho ? `${rt.conselho.toUpperCase()}${rt.uf ? `-${rt.uf}` : ""}${rt.numero ? ` ${rt.numero}` : ""}` : null;

function useHashDoPreview(chancela: Chancela, modelo: ModeloDeAssinatura | null) {
  const [hash, setHash] = useState<string | null>(null);
  useEffect(() => {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return;
    let vivo = true;
    // payload de preview: os mesmos dados que o selo mostra, em ordem fixa (canônico)
    const payload = JSON.stringify({ chancela, modelo });
    subtle.digest("SHA-256", new TextEncoder().encode(payload)).then((buffer) => {
      if (vivo) setHash([...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join(""));
    });
    return () => {
      vivo = false;
    };
  }, [chancela, modelo]);
  return hash;
}

function Selo({ chancela, modelo }: { chancela: Chancela; modelo: ModeloDeAssinatura | null }) {
  const hash = useHashDoPreview(chancela, modelo);
  const traco = t.preview.semDado;
  const conselho = conselhoDoRt(chancela.rt);
  const rt = chancela.rt?.nome ? `${chancela.rt.nome}${conselho ? ` · ${conselho}` : ""}` : traco;
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface-app p-4">
      <div className="flex items-center justify-between gap-3 border-b border-dashed border-border-functional pb-3">
        <p className="flex items-center gap-1.5 text-text-primary">
          <span className="sr-only">{t.preview.marcaFalada}</span>
          <Monograma className="size-6" />
          <span aria-hidden="true" className="font-atta text-xl">ATTA</span>
          <span aria-hidden="true" className="font-product">{t.preview.marca}</span>
        </p>
        <span className={`${chip} whitespace-nowrap`}>
          {ponto}
          {t.preview.incluso}
        </span>
      </div>
      <p className="font-title text-2xl leading-tight">{chancela.nomeFantasia ?? traco}</p>
      <p className="text-text-secondary">
        {chancela.razaoSocial ?? traco} · {chancela.cnpj ? t.preview.cnpj(chancela.cnpj) : traco}
      </p>
      <p className="text-text-secondary">
        {t.preview.rt} <strong className="font-semibold text-text-primary">{rt}</strong>
      </p>
      <p className="text-text-secondary">
        {t.preview.partes} {modelo ? t.preview.partesPorModelo[modelo] : traco}
      </p>
      <div className="flex flex-col gap-1">
        <p className="text-xs text-text-secondary">{t.preview.hash}</p>
        <p className="font-codigo text-xs break-all">{hash ?? traco}</p>
        <p className="font-codigo font-semibold">{t.preview.codigo}</p>
        <p className="text-text-secondary">{t.preview.verificar}</p>
      </div>
      <p className="border-t border-dashed border-border-functional pt-3 font-codigo text-xs">
        {t.preview.rodape} {t.preview.fimDoDocumento} · {chancela.razaoSocial ?? traco} · {chancela.cnpj ? t.preview.cnpj(chancela.cnpj) : traco}
        {chancela.rt?.nome ? ` · RT ${chancela.rt.nome}${conselho ? ` (${conselho})` : ""}` : ""}
      </p>
    </div>
  );
}
