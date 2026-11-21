"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import type { Resultado } from "@/lib/errors";
import { textos } from "../textos";

// "Arquivar paciente" da Pasta (Simulador ATTA-in, captura 12: o botão da caixa no "Resumo do paciente"; PLANO, decisão
// do dono de 20/11). Só o gestor vê o botão; o banco confere de novo o papel e recusa com agendamento em aberto. Arquivar
// pede confirmação num <dialog> modal; desarquivar é direto, no aviso de arquivado. Depois, o router.refresh() relê a Pasta.

const t = textos.pasta.arquivo;

// Depois de arquivar (ou desarquivar), o router.refresh() troca o botão pelo aviso (ou o contrário) e o foco cairia no
// body: quem acabou de agir avisa aqui, e o elemento novo pega o foco ao montar. Abrir a Pasta de um arquivado não move o foco.
let focarDepoisDe: "arquivar" | "desarquivar" | null = null;
type Arquivar = (e: { id: string; arquivar: boolean }) => Promise<Resultado<{ arquivado: boolean }>>;

const mensagemDoErro = (r: Exclude<Resultado<unknown>, { ok: true }>) =>
  r.error.code === "CONFLITO" && r.error.reason === "ATTA-IN-0003:appointments" ? t.emAberto : t.erro;

function IconeDeArquivo() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M3 5h18v4H3zM5 9v10h14V9M10 13h4" />
    </svg>
  );
}

export function BotaoDeArquivar({ id, arquivar }: { id: string; arquivar: Arquivar }) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const router = useRouter();
  const caixa = useRef<HTMLDialogElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const jaAbriu = useRef(false);
  const titulo = useId();

  useEffect(() => {
    if (focarDepoisDe !== "desarquivar") return;
    focarDepoisDe = null;
    gatilho.current?.focus();
  }, []);

  useEffect(() => {
    const d = caixa.current;
    if (aberto && d && !d.open) d.showModal();
    if (!aberto && d?.open) d.close();
    if (aberto) jaAbriu.current = true;
    else if (jaAbriu.current) gatilho.current?.focus(); // o foco volta ao botão depois que o <dialog> fecha
  }, [aberto]);

  const confirmar = () =>
    iniciar(async () => {
      const r = await arquivar({ id, arquivar: true });
      if (!r.ok) return setErro(mensagemDoErro(r));
      focarDepoisDe = "arquivar";
      setAberto(false);
      router.refresh();
    });

  return (
    <>
      <button
        ref={gatilho}
        type="button"
        aria-label={t.arquivar}
        title={t.arquivar}
        onClick={() => {
          setErro(null);
          setAberto(true);
        }}
        className="flex size-11 items-center justify-center rounded-md border border-border-functional bg-surface-raised text-status-negative hover:bg-surface-card medium:size-8"
      >
        <IconeDeArquivo />
      </button>
      <dialog
        ref={caixa}
        aria-labelledby={titulo}
        onCancel={(e) => {
          e.preventDefault();
          setAberto(false);
        }}
        className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-md border border-border bg-surface-raised p-5 text-corpo text-text-primary backdrop:bg-text-primary/40"
      >
        <h2 id={titulo} className="text-titulo font-semibold">
          {t.confirmarTitulo}
        </h2>
        <p className="mt-2 text-text-secondary">{t.confirmarTexto}</p>
        {erro && (
          <p role="alert" className="mt-3 rounded-md border border-border border-l-4 border-l-status-negative p-3">
            {erro}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => setAberto(false)} className="min-h-11 rounded-md border border-border-functional px-4 font-medium medium:min-h-9">
            {t.cancelar}
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={enviando}
            className="min-h-11 rounded-md bg-status-negative px-4 font-medium text-on-brand disabled:opacity-60 medium:min-h-9"
          >
            {t.confirmar}
          </button>
        </div>
      </dialog>
    </>
  );
}

/** Aviso no topo da Pasta de quem está arquivado; o gestor desarquiva ali mesmo. */
export function AvisoDeArquivado({ id, arquivadoEm, arquivar }: { id: string; arquivadoEm: string; arquivar: Arquivar | null }) {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const router = useRouter();
  const aviso = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focarDepoisDe !== "arquivar") return;
    focarDepoisDe = null;
    aviso.current?.focus();
  }, []);
  const desarquivar = () =>
    iniciar(async () => {
      const r = await arquivar!({ id, arquivar: false });
      if (!r.ok) return setErro(mensagemDoErro(r));
      focarDepoisDe = "desarquivar";
      router.refresh();
    });
  return (
    <div ref={aviso} tabIndex={-1} role="status" className="flex flex-wrap items-center gap-3 rounded-md border border-border border-l-4 border-l-status-pending bg-surface-raised p-3 text-corpo">
      <p className="min-w-0 flex-1">{t.arquivado(arquivadoEm)}</p>
      {arquivar && (
        <button type="button" onClick={desarquivar} disabled={enviando} className="min-h-11 rounded-md border border-border-functional px-4 font-medium disabled:opacity-60 medium:min-h-8">
          {t.desarquivar}
        </button>
      )}
      {erro && <p className="w-full text-status-negative">{erro}</p>}
    </div>
  );
}
