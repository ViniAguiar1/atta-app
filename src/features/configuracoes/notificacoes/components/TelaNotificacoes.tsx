"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { CartaoDeSecao } from "@/components/ui/CartaoDeSecao";
import { DataState } from "@/components/ui/DataState";
import type { Erro, Resultado } from "@/lib/errors";
import { type AlertasDaEquipe, type Canal, CATEGORIAS, EVENTOS, FREQUENCIAS, type FrequenciaDoResumo } from "@/server/alertas/tipos";
import { alterarCanal, ligarCanal, marcarEvento, salvarFiltros } from "../actions";
import { textos as t } from "../textos";

// Configurações › Notificações (PDD v206 §10.4.6; Simulador ATTA-in, captura 45). Três cartões: canais, eventos e
// filtros. Cada mudança grava sozinha (caixa ao marcar, campo ao sair) e a tela passa a mostrar o que o banco guardou;
// se ele recusar, a mudança volta e o motivo aparece junto do controle. O e-mail e o número da equipe chegam só
// mascarados (dado pessoal): o campo começa vazio e serve para trocar o destino, que vai numa ação própria.
type Props = { resultado: Resultado<AlertasDaEquipe | null> | null };

// a regra vem no reason (ADR 0001 §5): ATTA-IN-0001:address (formato), ATTA-IN-0003:address (ligar canal sem destino)
// e ATTA-IN-0003:estado (endereço novo com o canal desligado)
function mensagem(erro: Erro, campo?: "email" | "whatsapp"): string {
  if (erro.reason === "ATTA-IN-0003:address") return t.erros.semDestino;
  if (erro.reason === "ATTA-IN-0003:estado") return t.erros.canalDesligado;
  if (erro.code === "VALIDACAO" && campo) return campo === "email" ? t.erros.email : t.erros.numero;
  return erro.code === "SEM_PERMISSAO" ? t.erros.SEM_PERMISSAO : t.erros.outro;
}

const caixa = "size-5 shrink-0 cursor-pointer accent-brand disabled:cursor-not-allowed";
// alvo de toque de 44 px no celular e 32 px a partir de medium em volta da caixa de 20 px, sem mudar o visual (Guia §3)
const alvo = "inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center medium:min-h-8 medium:min-w-8";
const chip = "inline-flex items-center gap-1.5 rounded-full bg-surface-card px-2.5 py-1 text-xs font-medium";
const ponto = <span aria-hidden="true" className="size-1.5 rounded-full bg-text-secondary" />;

export function TelaNotificacoes({ resultado }: Props) {
  const router = useRouter();
  const [dados, setDados] = useState<AlertasDaEquipe | null>(resultado?.ok ? resultado.data : null);
  const [erro, setErro] = useState<{ onde: string; texto: string } | null>(null);
  const [salvando, executar] = useTransition();
  const estado = !resultado
    ? ({ tipo: "carregando" } as const)
    : !resultado.ok
      ? ({ tipo: "erro", tentarDeNovo: () => router.refresh(), codigo: resultado.error.code } as const)
      : !dados
        ? ({ tipo: "vazio" } as const)
        : ({ tipo: "pronto" } as const);

  function gravar(onde: string, acao: () => Promise<Resultado<AlertasDaEquipe>>, campo?: "email" | "whatsapp") {
    if (salvando) return;
    executar(async () => {
      const r = await acao();
      if (!r.ok) return setErro({ onde, texto: mensagem(r.error, campo) });
      setErro(null);
      setDados(r.data);
    });
  }
  const erroEm = (onde: string) => (erro?.onde === onde ? erro.texto : null);

  return (
    // corpo em 13 px (text-corpo), a escala do painel nas capturas
    <section aria-labelledby="titulo-notificacoes" className="text-corpo">
      <h2 id="titulo-notificacoes" className="sr-only">
        {t.titulo}
      </h2>
      <DataState estado={estado} rotulo={t.estado} esqueleto={{ linhas: 3, alturaRem: 12 }} vazio={t.vazio}>
        {dados && (
          <div className="flex flex-col gap-4">
            <Canais dados={dados} gravar={gravar} erroEm={erroEm} />
            <Eventos dados={dados} gravar={gravar} erroEm={erroEm} />
            <Filtros dados={dados} gravar={gravar} erroEm={erroEm} />
          </div>
        )}
      </DataState>
      <p role="status" className="sr-only">
        {erro ? erro.texto : ""}
      </p>
    </section>
  );
}

type Gravar = (onde: string, acao: () => Promise<Resultado<AlertasDaEquipe>>, campo?: "email" | "whatsapp") => void;
type Parte = { dados: AlertasDaEquipe; gravar: Gravar; erroEm: (onde: string) => string | null };

function Canais({ dados, gravar, erroEm }: Parte) {
  return (
    <CartaoDeSecao
      nivel={3}
      titulo={t.canais.titulo}
      subtitulo={t.canais.subtitulo}
      icone="🔔"
      acao={
        <span className={chip}>
          {ponto}
          {t.canais.quemRecebe}
        </span>
      }
    >
      <div className="grid gap-2.5 expanded:grid-cols-3">
        <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-app p-3.5">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-semibold">{t.canais.sino.nome}</h4>
            <label className="flex min-h-11 items-center gap-2 text-text-secondary medium:min-h-8">
              <input type="checkbox" className={caixa} checked disabled readOnly />
              {t.canais.sino.estado}
            </label>
          </div>
        </div>
        {/* a chave recomeça o campo quando o destino salvo muda: depois de trocar, ele volta vazio */}
        <CartaoDoCanal key={`email-${dados.email.destinoMascarado}`} canal="email" dados={dados} gravar={gravar} erroEm={erroEm} />
        <CartaoDoCanal key={`whatsapp-${dados.whatsapp.destinoMascarado}`} canal="whatsapp" dados={dados} gravar={gravar} erroEm={erroEm} />
      </div>
    </CartaoDeSecao>
  );
}

function CartaoDoCanal({ canal, dados, gravar, erroEm }: Parte & { canal: Canal }) {
  const id = useId();
  const textoDoCanal = t.canais[canal];
  const ativo = dados[canal].ativo;
  const cadastrado = dados[canal].destinoMascarado;
  const [rascunho, setRascunho] = useState("");
  // ligar um canal sem destino: a caixa fica marcada só na tela e o campo abre; o destino e o "ligado" vão juntos
  // (o banco não liga canal sem destino, ATTA-IN-0003:address). Saiu sem preencher: a caixa volta a desligada.
  const [ligando, setLigando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const editavel = ativo || ligando;
  const erro = erroEm(`destino-${canal}`);
  const salvarDestino = () => {
    const valor = rascunho.trim();
    if (!valor) return setLigando(false);
    gravar(`destino-${canal}`, () => alterarCanal({ canal, destino: valor, ...(ligando ? { ativar: true } : {}) }), canal);
  };
  const mudarLigado = (marcado: boolean) => {
    if (marcado && !cadastrado) {
      setLigando(true);
      return setTimeout(() => campo.current?.focus(), 0);
    }
    setLigando(false);
    gravar(`canal-${canal}`, () => ligarCanal({ canal, ativo: marcado }));
  };
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-app p-3.5">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-semibold">{textoDoCanal.nome}</h4>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-text-secondary medium:min-h-8">
          <input
            type="checkbox"
            className={caixa}
            checked={editavel}
            aria-label={t.canais.ligarFalado(textoDoCanal.nome)}
            onChange={(e) => mudarLigado(e.target.checked)}
          />
          <span aria-hidden="true">{editavel ? t.canais.ativo : t.canais.desligado}</span>
        </label>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={id}>{textoDoCanal.campo}</label>
        <input
          id={id}
          ref={campo}
          type={canal === "email" ? "email" : "tel"}
          autoComplete={canal === "email" ? "email" : "tel"}
          inputMode={canal === "email" ? "email" : "tel"}
          disabled={!editavel}
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          onBlur={salvarDestino}
          onKeyDown={(e) => e.key === "Enter" && salvarDestino()}
          aria-invalid={erro ? true : undefined}
          aria-describedby={`${id}-ajuda`}
          className="min-h-11 w-full rounded-md border border-border-functional bg-surface-raised px-3 disabled:cursor-not-allowed disabled:opacity-60 medium:min-h-9"
        />
        <p id={`${id}-ajuda`} className={`text-xs ${erro ? "text-status-negative" : "text-text-secondary"}`}>
          {erro ??
            [
              ligando ? t.erros.semDestino : null,
              cadastrado ? textoDoCanal.cadastrado(cadastrado) : null,
              canal === "whatsapp" && !editavel ? t.canais.whatsapp.ajuda : null,
            ]
              .filter(Boolean)
              .join(" ")}
        </p>
      </div>
      {erroEm(`canal-${canal}`) && <p className="text-xs text-status-negative">{erroEm(`canal-${canal}`)}</p>}
    </div>
  );
}

function Eventos({ dados, gravar, erroEm }: Parte) {
  const total = EVENTOS.length;
  const marcados = (canal: Canal) => dados.eventos.filter((e) => e[canal]).length;
  const marca = (chave: string, canal: Canal) => dados.eventos.find((e) => e.chave === chave)?.[canal] ?? false;
  return (
    <CartaoDeSecao
      nivel={3}
      titulo={t.eventos.titulo}
      subtitulo={t.eventos.subtitulo(total, CATEGORIAS.length)}
      icone="📋"
      texto={t.eventos.texto}
      acao={
        <span className="flex flex-wrap justify-end gap-2">
          <span className={chip}>
            {ponto}
            {t.eventos.contagem(t.eventos.colunas.email, marcados("email"), total)}
          </span>
          <span className={chip}>
            {ponto}
            {t.eventos.contagem(t.eventos.colunas.whatsapp, marcados("whatsapp"), total)}
          </span>
        </span>
      }
    >
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-left">
          <caption className="sr-only">{t.eventos.legenda}</caption>
          <thead className="bg-surface-app font-medium">
            <tr className="border-b border-border">
              <th scope="col" className="px-3 py-2.5">{t.eventos.colunas.evento}</th>
              <th scope="col" className="w-40 px-3 py-2.5 text-center">{t.eventos.colunas.email}</th>
              <th scope="col" className="w-80 px-3 py-2.5 text-center">
                {t.eventos.colunas.whatsapp} <span className="font-normal">{t.eventos.colunas.consome}</span>
                {!dados.whatsapp.ativo && (
                  <>
                    {" "}
                    <span className="font-normal">{t.eventos.colunas.desligado}</span>
                  </>
                )}
              </th>
            </tr>
          </thead>
          {CATEGORIAS.map((categoria) => (
            <tbody key={categoria}>
              <tr className="border-b border-border bg-surface-app">
                <th scope="colgroup" colSpan={3} className="px-3 py-2.5 text-xs font-medium tracking-wide text-text-secondary uppercase">
                  {t.eventos.categorias[categoria]}
                </th>
              </tr>
              {EVENTOS.filter((e) => e.categoria === categoria).map((e) => (
                <tr key={e.chave} className="border-b border-border last:border-b-0">
                  <th scope="row" className="px-3 py-3 font-normal">
                    {t.eventos.nomes[e.chave]}
                    {t.eventos.ajudas[e.chave] && <span className="block text-xs text-text-secondary">{t.eventos.ajudas[e.chave]}</span>}
                    {erroEm(`evento-${e.chave}`) && <span className="block text-xs text-status-negative">{erroEm(`evento-${e.chave}`)}</span>}
                  </th>
                  {(["email", "whatsapp"] as const).map((canal) => (
                    <td key={canal} className="px-3 py-1 text-center">
                      <label className={alvo}>
                        <input
                          type="checkbox"
                          className={caixa}
                          checked={marca(e.chave, canal)}
                          disabled={!dados[canal].ativo}
                          aria-label={t.eventos.marcarFalado(t.eventos.nomes[e.chave], t.eventos.colunas[canal])}
                          onChange={(ev) => gravar(`evento-${e.chave}`, () => marcarEvento({ chave: e.chave, canal, marcado: ev.target.checked }))}
                        />
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </CartaoDeSecao>
  );
}

function Filtros({ dados, gravar, erroEm }: Parte) {
  const id = useId();
  const { pausaNoturna, frequenciaDoResumo } = dados.filtros;
  const salvar = (filtros: { pausaNoturna: boolean; frequenciaDoResumo: FrequenciaDoResumo }) => gravar("filtros", () => salvarFiltros(filtros));
  return (
    <CartaoDeSecao
      nivel={3}
      titulo={t.filtros.titulo}
      subtitulo={t.filtros.subtitulo}
      icone="🌙"
      texto={t.filtros.texto}
      acao={
        dados.emPausaNoturna === null ? undefined : (
          <span className={chip}>
            {ponto}
            {dados.emPausaNoturna ? t.filtros.naPausa : t.filtros.foraDaPausa}
          </span>
        )
      }
    >
      <div className="grid gap-3 expanded:grid-cols-2">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border bg-surface-app px-3.5">
          <input
            type="checkbox"
            className={caixa}
            checked={pausaNoturna}
            onChange={(e) => salvar({ pausaNoturna: e.target.checked, frequenciaDoResumo })}
          />
          {t.filtros.pausa}
        </label>
        <div className="flex flex-col gap-1">
          <label htmlFor={id}>{t.filtros.frequencia}</label>
          <select
            id={id}
            value={frequenciaDoResumo}
            onChange={(e) => salvar({ pausaNoturna, frequenciaDoResumo: e.target.value as FrequenciaDoResumo })}
            aria-describedby={`${id}-ajuda`}
            className="min-h-11 w-full rounded-md border border-border-functional bg-surface-raised px-3"
          >
            {FREQUENCIAS.map((f) => (
              <option key={f} value={f}>
                {t.filtros.opcoes[f]}
              </option>
            ))}
          </select>
          <p id={`${id}-ajuda`} className="text-xs text-text-secondary">
            {t.filtros.ajudas[frequenciaDoResumo]}
          </p>
        </div>
      </div>
      {erroEm("filtros") && <p className="text-xs text-status-negative">{erroEm("filtros")}</p>}
    </CartaoDeSecao>
  );
}
