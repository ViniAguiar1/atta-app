"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import type { Resultado } from "@/lib/errors";
import { textosDaImportacao as t, VERSAO_DA_DECLARACAO } from "./textos";
import type { PreviaImportacao as PreviaDaImportacao } from "@/server/importacao/porta";

// Fluxo "Importar base de pacientes" (PDD v206 §10.1; PLANO "Importação de pacientes, MIG-34"; decisão do CTO de 21/11:
// um componente só, usado no módulo Pacientes e em Configurações › Importação). Em um <dialog> modal:
// 1. a planilha modelo; 2. a declaração (a área de envio só libera depois dela); 3. o envio do .xlsx (até 20 MB) direto ao
// armazenamento, pela URL assinada que o servidor cria depois da declaração; 4. a prévia do servidor, sem gravar nada,
// com as linhas que ficam de fora (só número e motivo, nunca o conteúdo) e as que entram com campo em branco; 5. a
// confirmação, que não se desfaz. As regras são do servidor (porta da Integrações); a tela só confere o tipo e o tamanho
// para avisar antes.

const LIMITE_EM_BYTES = 20 * 1024 * 1024;

export type AcoesDaImportacao = {
  urlDoModelo: () => Promise<Resultado<{ url: string }>>;
  declarar: (e: { versao: string }) => Promise<Resultado<{ declaration_id: string }>>;
  iniciarEnvio: (e: { declarationId: string; tamanho: number }) => Promise<Resultado<{ import_id: string; upload_url: string }>>;
  previa: (e: { importId: string }) => Promise<Resultado<PreviaDaImportacao>>;
  confirmar: (e: { importId: string }) => Promise<Resultado<{ status: "processando"; due_at: string }>>;
};

/** Envia o arquivo à URL assinada. Separado para o teste (e a simulada) trocarem o transporte sem mudar o fluxo. */
export type EnviarArquivo = (url: string, arquivo: File) => Promise<boolean>;
const enviarPorPut: EnviarArquivo = async (url, arquivo) => {
  const r = await fetch(url, { method: "PUT", body: arquivo, headers: { "content-type": arquivo.type || "application/octet-stream" } });
  return r.ok;
};

type Etapa =
  | { tipo: "inicio" }
  | { tipo: "lendo" }
  | { tipo: "previa"; importId: string; previa: PreviaDaImportacao }
  | { tipo: "enviado"; ate: string };

// o prazo sai no fuso da clínica (ADR 0001 §4), que a página lê do servidor
const dataBr = (iso: string, fuso: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: fuso }).format(new Date(iso));

// fora do modelo: VALIDACAO no campo "arquivo" (contrato com a Integrações); nunca pela message, que é texto livre
function mensagemDoErro(r: Exclude<Resultado<unknown>, { ok: true }>) {
  if (r.error.code === "VALIDACAO" && r.error.fields?.[0]?.campo === "arquivo") return t.erro.foraDoModelo;
  if (r.error.code === "LIMITE") return t.erro.LIMITE;
  if (r.error.code === "SEM_PERMISSAO") return t.erro.SEM_PERMISSAO;
  return t.erro.outro;
}

export function FluxoDeImportacao({
  acoes,
  fuso,
  enviarArquivo = enviarPorPut,
  aoConcluir,
}: {
  acoes: AcoesDaImportacao;
  /** fuso da clínica (platform.tenant.timezone) */
  fuso: string;
  enviarArquivo?: EnviarArquivo;
  /** depois de uma importação recebida, ao fechar (ex.: router.refresh(), para a cota não ficar velha) */
  aoConcluir?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const gatilho = useRef<HTMLButtonElement>(null);
  const jaAbriu = useRef(false);
  useEffect(() => {
    if (aberto) jaAbriu.current = true;
    else if (jaAbriu.current) gatilho.current?.focus(); // o foco volta ao botão depois que o <dialog> fecha
  }, [aberto]);
  return (
    <>
      <button
        ref={gatilho}
        type="button"
        onClick={() => setAberto(true)}
        className="min-h-11 w-fit rounded-md bg-text-primary px-3.5 text-corpo font-semibold text-on-brand medium:min-h-8"
      >
        {t.importar}
      </button>
      {aberto && (
        <Caixa
          acoes={acoes}
          fuso={fuso}
          enviarArquivo={enviarArquivo}
          aoFechar={(concluiu) => {
            setAberto(false);
            if (concluiu) aoConcluir?.();
          }}
        />
      )}
    </>
  );
}

function Caixa({ acoes, fuso, enviarArquivo, aoFechar }: { acoes: AcoesDaImportacao; fuso: string; enviarArquivo: EnviarArquivo; aoFechar: (concluiu: boolean) => void }) {
  const caixa = useRef<HTMLDialogElement>(null);
  const titulo = useId();
  const idDaDeclaracao = useId();
  const [declarou, setDeclarou] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>({ tipo: "inicio" });
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);
  const mensagem = useRef<HTMLParagraphElement>(null);

  // <dialog> nativo em modo modal: prende o foco, deixa o resto inerte e trata o Esc (o mesmo padrão do Novo paciente)
  useEffect(() => {
    const d = caixa.current;
    if (d && !d.open) d.showModal();
  }, []);
  const concluiu = etapa.tipo === "enviado";
  useEffect(() => {
    if (concluiu) mensagem.current?.focus();
  }, [concluiu]);

  const baixarModelo = () =>
    iniciar(async () => {
      const r = await acoes.urlDoModelo();
      if (!r.ok) return setErro(mensagemDoErro(r));
      // baixa por um link com download, sem sair do painel no meio do fluxo (nota do Frontend)
      const link = document.createElement("a");
      link.href = r.data.url;
      link.download = "";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    });

  const escolher = (arquivo: File | undefined) => {
    if (!arquivo) return;
    setErro(null);
    if (!arquivo.name.toLowerCase().endsWith(".xlsx")) return setErro(t.erro.tipo);
    if (arquivo.size > LIMITE_EM_BYTES) return setErro(t.erro.tamanho);
    setEtapa({ tipo: "lendo" });
    iniciar(async () => {
      const falhou = (msg: string) => {
        setErro(msg);
        setEtapa({ tipo: "inicio" });
        if (entrada.current) entrada.current.value = "";
      };
      const declaracao = await acoes.declarar({ versao: VERSAO_DA_DECLARACAO });
      if (!declaracao.ok) return falhou(mensagemDoErro(declaracao));
      const envio = await acoes.iniciarEnvio({ declarationId: declaracao.data.declaration_id, tamanho: arquivo.size });
      if (!envio.ok) return falhou(mensagemDoErro(envio));
      let subiu = false;
      try {
        subiu = await enviarArquivo(envio.data.upload_url, arquivo);
      } catch {
        subiu = false;
      }
      if (!subiu) return falhou(t.erro.envio);
      const previa = await acoes.previa({ importId: envio.data.import_id });
      if (!previa.ok) return falhou(mensagemDoErro(previa));
      setEtapa({ tipo: "previa", importId: envio.data.import_id, previa: previa.data });
    });
  };

  const confirmar = (importId: string) =>
    iniciar(async () => {
      const r = await acoes.confirmar({ importId });
      if (!r.ok) return setErro(mensagemDoErro(r));
      setErro(null);
      setEtapa({ tipo: "enviado", ate: dataBr(r.data.due_at, fuso) });
    });

  const fechar = () => aoFechar(concluiu);
  const botaoSecundario = "min-h-11 rounded-md border border-border-functional px-4 text-corpo font-medium disabled:opacity-60 medium:min-h-9";
  const botaoPrimario = "min-h-11 rounded-md bg-text-primary px-4 text-corpo font-semibold text-on-brand disabled:opacity-60 medium:min-h-9";

  return (
    <dialog
      ref={caixa}
      aria-labelledby={titulo}
      onCancel={(e) => {
        e.preventDefault();
        fechar();
      }}
      className="m-auto max-h-[calc(100%-2rem)] w-[min(40rem,calc(100%-2rem))] overflow-y-auto rounded-lg border border-border bg-surface-raised p-5 text-corpo text-text-primary backdrop:bg-text-primary/40"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id={titulo} className="text-titulo font-semibold">
          {t.fluxo.titulo}
        </h2>
        <button type="button" onClick={fechar} aria-label={t.fluxo.fechar} className="flex size-11 items-center justify-center rounded-md hover:bg-surface-card medium:size-8">
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      {erro && (
        <p role="alert" className="mt-3 rounded-md border border-border border-l-4 border-l-status-negative p-3">
          {erro}
        </p>
      )}

      {etapa.tipo === "enviado" ? (
        <div className="mt-4 flex flex-col gap-4">
          <p ref={mensagem} tabIndex={-1} role="status" className="rounded-md bg-surface-app p-3">
            {t.fluxo.enviado(etapa.ate)}
          </p>
          <button type="button" onClick={fechar} className={`${botaoPrimario} self-end`}>
            {t.fluxo.concluir}
          </button>
        </div>
      ) : etapa.tipo === "previa" ? (
        <Previa
          previa={etapa.previa}
          ocupado={ocupado}
          aoConfirmar={() => confirmar(etapa.importId)}
          aoTrocar={() => {
            setErro(null);
            setEtapa({ tipo: "inicio" });
          }}
          botaoPrimario={botaoPrimario}
          botaoSecundario={botaoSecundario}
        />
      ) : (
        <div className="mt-4 flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">{t.fluxo.passoModelo}</h3>
            <p className="text-xs text-text-secondary">{t.fluxo.modeloTexto}</p>
            <button type="button" onClick={baixarModelo} disabled={ocupado} className={`${botaoSecundario} w-fit`}>
              {t.fluxo.baixarModelo}
            </button>
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">{t.fluxo.passoDeclaracao}</h3>
            <div className="flex items-start gap-3">
              <input
                id={idDaDeclaracao}
                type="checkbox"
                checked={declarou}
                onChange={(e) => setDeclarou(e.target.checked)}
                className="mt-1 size-4 shrink-0"
              />
              <label htmlFor={idDaDeclaracao}>{t.fluxo.declaracao}</label>
            </div>
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">{t.fluxo.passoArquivo}</h3>
            {!declarou && <p className="text-xs text-text-secondary">{t.fluxo.arquivoTexto}</p>}
            {/* o input fica escondido dentro do rótulo: o anel de foco vai no rótulo (WCAG 2.4.7, nota do Frontend) */}
            <label
              className={`${botaoSecundario} flex w-fit cursor-pointer items-center has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring ${!declarou || ocupado ? "pointer-events-none opacity-60" : ""}`}
            >
              {etapa.tipo === "lendo" ? t.fluxo.lendo : t.fluxo.escolherArquivo}
              <input
                ref={entrada}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={!declarou || ocupado}
                onChange={(e) => escolher(e.target.files?.[0])}
                className="sr-only"
              />
            </label>
          </section>
        </div>
      )}
    </dialog>
  );
}

function Previa({
  previa,
  ocupado,
  aoConfirmar,
  aoTrocar,
  botaoPrimario,
  botaoSecundario,
}: {
  previa: PreviaDaImportacao;
  ocupado: boolean;
  aoConfirmar: () => void;
  aoTrocar: () => void;
  botaoPrimario: string;
  botaoSecundario: string;
}) {
  return (
    <section aria-label={t.fluxo.previaTitulo} className="mt-4 flex flex-col gap-4">
      <h3 className="font-semibold">{t.fluxo.previaTitulo}</h3>
      <p>{t.fluxo.previaResumo(previa.valid, previa.total)}</p>
      {previa.errors.length > 0 && (
        <div className="flex flex-col gap-1">
          <h4 className="text-xs font-semibold">{t.fluxo.foraDaImportacao}</h4>
          <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto rounded-md border border-border border-l-4 border-l-status-negative p-3 text-xs">
            {previa.errors.map((e) => (
              <li key={`${e.line}-${e.code}`}>{t.fluxo.linhaFora(e.line, t.motivo[e.code])}</li>
            ))}
          </ul>
        </div>
      )}
      {previa.blanked.length > 0 && (
        <div className="flex flex-col gap-1">
          <h4 className="text-xs font-semibold">{t.fluxo.emBranco}</h4>
          <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto rounded-md border border-border border-l-4 border-l-status-pending p-3 text-xs">
            {previa.blanked.map((b) => (
              <li key={`${b.line}-${b.field}`}>{t.fluxo.linhaEmBranco(b.line, t.campo[b.field])}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-text-secondary">{t.fluxo.prazo}</p>
      {/* o aviso de que não tem volta fica à vista, logo acima do botão que não se desfaz (nota do Frontend) */}
      <p className="text-corpo font-medium text-text-primary">{t.fluxo.semVolta}</p>
      {previa.valid === 0 && <p className="text-xs">{t.fluxo.nenhumaValida}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={aoTrocar} disabled={ocupado} className={botaoSecundario}>
          {t.fluxo.outraPlanilha}
        </button>
        {previa.valid > 0 && (
          <button type="button" onClick={aoConfirmar} disabled={ocupado} className={botaoPrimario}>
            {t.fluxo.confirmar(previa.valid)}
          </button>
        )}
      </div>
    </section>
  );
}
