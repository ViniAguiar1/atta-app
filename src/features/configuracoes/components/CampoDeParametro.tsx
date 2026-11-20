"use client";

import { useId, useState, useTransition } from "react";
import type { Erro } from "@/lib/errors";
import type { Parametro } from "@/server/configuracoes/porta";
import { salvarParametro } from "../actions";
import { textos as t } from "../textos";

// Um parâmetro numérico (campo) ou de lista (select), gravado sozinho: o número ao sair do campo ou no Enter, a lista ao
// escolher. Quem decide limite e regra cruzada é o banco; a recusa aparece no campo, com o que fazer (PDD §26.8).
type Props = {
  parametro: Extract<Parametro, { tipo: "int" }>;
  rotulo: string;
  opcao?: (valor: number) => string; // com opção: select com os valores permitidos
  aoSalvar: (p: Parametro) => void;
};

function mensagem(erro: Erro, p: Props["parametro"]): string {
  if (erro.code === "VALIDACAO") return t.erros.limite(p.min, p.max);
  if (erro.code === "CONFLITO") {
    // a regra vem no reason ("ATTA-IN-0003:lembrete_2_min", ADR 0001 §5); o Erro da main ganha o campo com o #37
    const regra = (erro as Erro & { reason?: string }).reason?.split(":")[1];
    return regra === "lembrete_1_min" || regra === "lembrete_2_min" ? t.erros[regra] : t.erros.conflito;
  }
  return erro.code === "SEM_PERMISSAO" ? t.erros.SEM_PERMISSAO : t.erros.outro;
}

export function CampoDeParametro({ parametro, rotulo, opcao, aoSalvar }: Props) {
  const id = useId();
  const [rascunho, setRascunho] = useState(String(parametro.valor));
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [salvando, executar] = useTransition();

  function salvar(texto: string) {
    setSalvo(false);
    if (texto.trim() === String(parametro.valor)) return setErro(null);
    if (!/^\d+$/.test(texto.trim())) return setErro(t.erros.numero);
    executar(async () => {
      const r = await salvarParametro({ chave: parametro.chave, valor: Number(texto.trim()) });
      if (!r.ok) return setErro(mensagem(r.error, parametro));
      setErro(null);
      setSalvo(true);
      aoSalvar(r.data);
    });
  }

  const comum = {
    id,
    "aria-invalid": erro ? true : undefined,
    "aria-describedby": `${id}-situacao`,
    className: "min-h-11 w-full rounded-md border border-border-functional bg-surface-raised px-3",
  };

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id}>{rotulo}</label>
      {opcao && parametro.permitidos ? (
        <select
          {...comum}
          value={rascunho}
          onChange={(e) => {
            setRascunho(e.target.value);
            salvar(e.target.value);
          }}
        >
          {parametro.permitidos.map((v) => (
            <option key={v} value={String(v)}>
              {opcao(v)}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...comum}
          type="text"
          inputMode="numeric"
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          onBlur={() => salvar(rascunho)}
          onKeyDown={(e) => {
            if (e.key === "Enter") salvar(rascunho);
          }}
        />
      )}
      <p id={`${id}-situacao`} aria-live="polite" className={erro ? "text-status-negative" : "text-xs text-text-secondary"}>
        {erro ?? (salvando ? t.salvando : salvo ? t.salvo : "")}
      </p>
    </div>
  );
}
