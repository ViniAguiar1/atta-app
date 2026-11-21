"use client";

import { useEffect, useState, useTransition } from "react";
import type { ModeloDeDocumento, ServicoParaVincular } from "@/server/documentos/porta";
import { listarServicos, vincularProcedimentos } from "../actions";
import { textos } from "../textos";
import { Dialogo } from "./Dialogo";

// Vincular procedimentos (PDD §10.3.1 e §10.4.7): a lista de Serviços não excluídos da clínica, com os inativos
// marcados; salvar troca o conjunto inteiro (api.template_set_services).
type Props = { modelo: ModeloDeDocumento; aoFechar: () => void; aoSalvar: () => void };

const botao = "min-h-11 rounded-md px-5 py-2.5 font-medium";

export function DialogoVincular({ modelo, aoFechar, aoSalvar }: Props) {
  const [servicos, setServicos] = useState<ServicoParaVincular[] | null>(null);
  const [marcados, setMarcados] = useState(() => new Set(modelo.procedimentos.map((p) => p.id)));
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, executar] = useTransition();

  useEffect(() => {
    listarServicos().then((r) => (r.ok ? setServicos(r.data) : setErro(textos.falhou)));
  }, []);

  function alternar(id: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function salvar() {
    executar(async () => {
      const r = await vincularProcedimentos({ modeloId: modelo.id, servicoIds: [...marcados] });
      if (!r.ok) return setErro(textos.falhou);
      aoSalvar();
    });
  }

  return (
    <Dialogo titulo={textos.vincular.titulo(modelo.titulo)} aoFechar={aoFechar}>
      <p className="mb-3 text-text-secondary">{textos.vincular.texto}</p>
      {servicos === null && !erro && <p aria-live="polite">{textos.salvando}</p>}
      {servicos?.length === 0 && <p>{textos.vincular.semServicos}</p>}
      {servicos && servicos.length > 0 && (
        <fieldset className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          <legend className="sr-only">{textos.colunas.procedimentos}</legend>
          {servicos.map((s) => (
            <label key={s.id} className="flex min-h-11 items-center gap-3">
              <input type="checkbox" checked={marcados.has(s.id)} onChange={() => alternar(s.id)} className="size-4" />
              <span>
                {s.nome}
                {!s.ativo && <span className="ml-2 text-xs text-text-secondary">{textos.vincular.inativo}</span>}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {erro && (
        <p role="alert" className="mt-3 text-status-negative">
          {erro}
        </p>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <button type="button" onClick={aoFechar} disabled={ocupado} className={`${botao} border border-border-functional`}>
          {textos.cancelar}
        </button>
        <button type="button" onClick={salvar} disabled={ocupado || !servicos?.length} className={`${botao} bg-brand text-on-brand`}>
          {ocupado ? textos.salvando : textos.vincular.salvar}
        </button>
      </div>
    </Dialogo>
  );
}
