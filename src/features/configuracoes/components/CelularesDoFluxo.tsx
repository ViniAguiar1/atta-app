"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import type { Erro } from "@/lib/errors";
import type { CelularDoFluxo } from "@/server/configuracoes/porta";
import { adicionarCelular, removerCelular } from "../actions";
import { textos } from "../textos";

const t = textos.fluxo;

// Celulares da clínica que recebem o link do Fluxo alternativo (PDD §15.3; simulador, captura 03). O número volta
// mascarado do servidor, então o celular salvo aparece só para ler, com Remover; editar é remover e adicionar.
export function CelularesDoFluxo({ inicial }: { inicial: CelularDoFluxo[] }) {
  const [celulares, setCelulares] = useState(inicial);
  const [novo, setNovo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, executar] = useTransition();
  const botaoAdicionar = useRef<HTMLButtonElement>(null);

  function remover(c: CelularDoFluxo) {
    executar(async () => {
      const r = await removerCelular({ id: c.id });
      if (!r.ok && r.error.code !== "NAO_ENCONTRADO") return setAviso(textos.erros.outro);
      setAviso(null);
      setCelulares((lista) => lista.filter((x) => x.id !== c.id));
      botaoAdicionar.current?.focus(); // a linha some: o foco vai para um lugar estável
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h4 className="font-semibold">{t.celulares}</h4>
        <p className="text-text-secondary">{t.celularesTexto}</p>
      </div>
      {celulares.length === 0 && !novo ? (
        <p className="text-text-secondary">{t.nenhum}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {celulares.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2">
              <span className="min-w-0 flex-1 truncate">{c.nome}</span>
              <span className="text-text-secondary">{c.numeroMascarado}</span>
              <button
                type="button"
                disabled={ocupado}
                onClick={() => remover(c)}
                aria-label={t.removerFalado(c.nome)}
                className="min-h-11 rounded-full border border-border-functional px-4 text-sm font-medium hover:bg-surface-card disabled:opacity-60"
              >
                {t.remover}
              </button>
            </li>
          ))}
        </ul>
      )}
      {novo && (
        <NovoCelular
          ordem={celulares.length + 1}
          aoSalvar={(c) => {
            setCelulares((lista) => [...lista, c]);
            setNovo(false);
            requestAnimationFrame(() => botaoAdicionar.current?.focus());
          }}
          aoCancelar={() => {
            setNovo(false);
            requestAnimationFrame(() => botaoAdicionar.current?.focus());
          }}
        />
      )}
      <p aria-live="polite" className="text-status-negative">
        {aviso}
      </p>
      {!novo && (
        <button
          ref={botaoAdicionar}
          type="button"
          onClick={() => setNovo(true)}
          className="min-h-11 w-full rounded-full border border-border-functional bg-surface-raised text-sm font-medium hover:bg-surface-card"
        >
          {t.adicionar}
        </button>
      )}
    </div>
  );
}

type NovoProps = { ordem: number; aoSalvar: (c: CelularDoFluxo) => void; aoCancelar: () => void };

function NovoCelular({ ordem, aoSalvar, aoCancelar }: NovoProps) {
  const id = useId();
  const [nome, setNome] = useState("");
  const [numero, setNumero] = useState("");
  const [erros, setErros] = useState<{ nome?: boolean; numero?: boolean; geral?: string }>({});
  const [ocupado, executar] = useTransition();
  const primeiro = useRef<HTMLInputElement>(null);
  useEffect(() => primeiro.current?.focus(), []); // "+ Adicionar celular" abre o formulário já no nome

  function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    executar(async () => {
      const r = await adicionarCelular({ nome, numero });
      if (r.ok) return aoSalvar(r.data);
      const campos = new Set((r.error as Erro).fields?.map((f) => f.campo));
      setErros(
        r.error.code === "VALIDACAO"
          ? { nome: campos.has("nome"), numero: campos.has("numero") }
          : { geral: r.error.code === "LIMITE" ? t.erros.LIMITE : textos.erros.outro },
      );
      document.getElementById(campos.has("nome") ? `${id}-nome` : `${id}-numero`)?.focus();
    });
  }

  const campo = "min-h-11 rounded-md border border-border-functional bg-surface-raised px-3";
  return (
    <form onSubmit={salvar} noValidate className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex flex-col gap-3 medium:flex-row">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={`${id}-nome`}>{t.nome(ordem)}</label>
          <input
            ref={primeiro}
            id={`${id}-nome`}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder={t.exemploDeNome}
            autoComplete="off"
            aria-invalid={erros.nome || undefined}
            aria-describedby={erros.nome ? `${id}-nome-erro` : undefined}
            className={campo}
          />
          {erros.nome && (
            <p id={`${id}-nome-erro`} className="text-status-negative">
              {t.erros.nome}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1 medium:w-56">
          <label htmlFor={`${id}-numero`}>{t.numero(ordem)}</label>
          <input
            id={`${id}-numero`}
            type="tel"
            inputMode="tel"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            autoComplete="off"
            aria-invalid={erros.numero || undefined}
            aria-describedby={erros.numero ? `${id}-numero-erro` : undefined}
            className={campo}
          />
          {erros.numero && (
            <p id={`${id}-numero-erro`} className="text-status-negative">
              {t.erros.numero}
            </p>
          )}
        </div>
      </div>
      {erros.geral && (
        <p role="alert" className="text-status-negative">
          {erros.geral}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={ocupado} className="min-h-11 rounded-full bg-brand px-5 text-sm font-medium text-on-brand hover:bg-(--button-primary-hover-bg) disabled:opacity-60">
          {ocupado ? textos.salvando : t.salvarCelular}
        </button>
        <button type="button" onClick={aoCancelar} className="min-h-11 rounded-full border border-border-functional px-5 text-sm font-medium hover:bg-surface-card">
          {t.cancelar}
        </button>
      </div>
    </form>
  );
}
