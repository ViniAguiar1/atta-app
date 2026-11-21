"use client";

import { useEffect, useId, useRef, useState } from "react";
import { textosDaAgenda as textos } from "./textos";

// Diálogo de motivo das ações da agenda (PDD v206 §10.2.2 e §10.2.3): Cancelar agendamento (motivo da lista fechada) e
// Concluir pela recepção (motivo em chip + justificativa de no mínimo 50 caracteres, com contagem regressiva). <dialog>
// nativo com showModal: o navegador prende o foco, Esc fecha e o fundo fica inerte; ao fechar, o foco volta ao que abriu
// (o ⋮). Motivo é rádio em forma de chip, sem texto livre (Regra Transversal 3). Erro em role="alert"; a contagem
// descreve o campo, e o aria-live só anuncia quando o mínimo é atingido. Componente de domínio comum à Agenda e à Pasta. Dono: Frontend 4.

type Props = {
  titulo: string;
  texto: string;
  motivos: readonly string[];
  rotuloConfirmar: string;
  /** com ela, a justificativa escrita é obrigatória, com este mínimo de caracteres */
  justificativaMinima?: number;
  /** ação destrutiva (Cancelar): o botão de confirmar fica em vinho */
  negativo?: boolean;
  enviando?: boolean;
  /** erro do servidor, já traduzido */
  erro?: string | null;
  aoConfirmar: (escolha: { motivo: string; justificativa?: string }) => void;
  aoFechar: () => void;
};

export function DialogoDeMotivo({
  titulo,
  texto,
  motivos,
  rotuloConfirmar,
  justificativaMinima,
  negativo = false,
  enviando = false,
  erro = null,
  aoConfirmar,
  aoFechar,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const idDoTitulo = useId();
  const idDaContagem = useId();
  const [motivo, setMotivo] = useState<string | null>(null);
  const [justificativa, setJustificativa] = useState("");
  const [faltouMotivo, setFaltouMotivo] = useState(false);

  useEffect(() => {
    // Quem abriu (o ⋮) recebe o foco de volta ao fechar: o diálogo sai do DOM antes de o navegador devolver o foco
    // sozinho, e sem isto ele cai no body (achado S3 do QA no #297).
    const quemAbriu = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => {
      d?.close();
      if (quemAbriu?.isConnected) quemAbriu.focus();
    };
  }, []);

  const exigeJustificativa = justificativaMinima !== undefined;
  const faltam = exigeJustificativa ? Math.max(0, justificativaMinima - justificativa.trim().length) : 0;
  const d = textos.dialogo;

  return (
    <dialog
      ref={ref}
      aria-labelledby={idDoTitulo}
      onCancel={(e) => {
        e.preventDefault();
        aoFechar();
      }}
      className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-lg border border-border bg-surface-raised p-6 text-corpo text-text-primary backdrop:bg-text-primary/40"
    >
      <h2 id={idDoTitulo} className="mb-2 text-base font-medium">
        {titulo}
      </h2>
      <p className="mb-4 text-text-secondary">{texto}</p>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!motivo) {
            setFaltouMotivo(true);
            return;
          }
          if (faltam > 0) return;
          aoConfirmar(exigeJustificativa ? { motivo, justificativa: justificativa.trim() } : { motivo });
        }}
        className="flex flex-col gap-4"
      >
        <fieldset>
          <legend className="mb-2 font-medium">{d.motivo}</legend>
          <div className="flex flex-wrap gap-2">
            {motivos.map((codigo) => (
              <label key={codigo} className="relative">
                <input
                  type="radio"
                  name="motivo"
                  value={codigo}
                  checked={motivo === codigo}
                  onChange={() => {
                    setMotivo(codigo);
                    setFaltouMotivo(false);
                  }}
                  className="peer sr-only"
                />
                <span className="flex min-h-11 cursor-pointer items-center rounded-full border border-border-functional px-3 text-corpo peer-checked:border-brand peer-checked:bg-brand peer-checked:text-on-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring medium:min-h-8">
                  {textos.motivos[codigo] ?? textos.dialogo.motivoSemTexto}
                </span>
              </label>
            ))}
          </div>
          {faltouMotivo && (
            <p role="alert" className="mt-2 text-xs text-status-negative">
              {d.escolhaMotivo}
            </p>
          )}
        </fieldset>

        {exigeJustificativa && (
          <div className="flex flex-col gap-1">
            <label htmlFor={`${idDaContagem}-campo`} className="font-medium">
              {d.concluir.justificativa}
            </label>
            <textarea
              id={`${idDaContagem}-campo`}
              rows={4}
              maxLength={1000}
              value={justificativa}
              aria-describedby={idDaContagem}
              aria-invalid={faltam > 0 && justificativa.length > 0 ? true : undefined}
              onChange={(e) => setJustificativa(e.target.value)}
              className="rounded-md border border-border-functional bg-surface-raised p-3 text-corpo"
            />
            {/* a contagem visível é a descrição do campo (lida ao focar); o anúncio só sai ao atingir o mínimo (nota do TLF) */}
            <p id={idDaContagem} className="text-xs text-text-secondary">
              {faltam > 0 ? d.concluir.faltam(faltam) : d.concluir.atingido}
            </p>
            <p aria-live="polite" className="sr-only">
              {faltam === 0 ? d.concluir.atingido : ""}
            </p>
          </div>
        )}

        {erro && (
          <p role="alert" className="rounded-md border border-status-negative bg-status-negative/10 px-3 py-2 text-status-negative">
            {erro}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={aoFechar}
            className="min-h-11 rounded-md border border-border-functional px-4 font-medium medium:min-h-9"
          >
            {d.voltar}
          </button>
          <button
            type="submit"
            disabled={enviando || faltam > 0}
            aria-busy={enviando || undefined}
            className={`min-h-11 rounded-md px-4 font-medium disabled:opacity-50 medium:min-h-9 ${
              negativo ? "bg-status-negative text-on-brand" : "bg-brand text-on-brand"
            }`}
          >
            {rotuloConfirmar}
          </button>
        </div>
      </form>
    </dialog>
  );
}
