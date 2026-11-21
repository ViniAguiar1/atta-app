"use client";

import { useState } from "react";
import type { Acao, Status } from "@/lib/agenda/linha";
import {
  JUSTIFICATIVA_MINIMA,
  MOTIVOS_CANCELAR_ANTES,
  MOTIVOS_CANCELAR_DEPOIS,
  MOTIVOS_CONCLUIR,
  MOTIVOS_REABRIR,
  type EntradaDaAcao,
} from "@/lib/agenda/acoes";
import type { Resultado } from "@/lib/errors";
import { DialogoDeMotivo } from "./DialogoDeMotivo";
import { textosDaAgenda as textos } from "./textos";

// As ações da linha de agendamento (PDD v206 §10.2.2 e §10.2.3), comuns à Agenda e à Pasta do Paciente (decisão do
// Tech Lead Frontend, ORDEM.md "Decisões de componentes"). Confirmar e Marcar como ausente gravam direto; Cancelar,
// Concluir pela recepção e Reabrir preenchimento abrem o diálogo de motivo, e o erro do servidor fica nele. O texto do
// erro vem do code/reason (nunca a message). Quem usa desenha o aviso (role="status" no sucesso, role="alert" no erro),
// porque o lugar dele muda entre as telas, e decide o que reler depois de gravar. A server action chega por prop, pela
// borda da rota (uma feature não importa outra). Dono: Frontend 4.

/** O que o diálogo precisa saber da linha: o id e o estado (os motivos do Cancelar mudam com a chegada). */
export type LinhaDaAcao = { id: string; status: Status };
export type ExecutarAcao = (entrada: EntradaDaAcao) => Promise<Resultado<null>>;
export type AvisoDaAcao = { tipo: "ok" | "erro"; texto: string };

type AcaoComMotivo = "cancelar" | "concluir_pela_recepcao" | "reabrir_preenchimento";
const TEXTOS_DO_DIALOGO = {
  cancelar: textos.dialogo.cancelar,
  concluir_pela_recepcao: textos.dialogo.concluir,
  reabrir_preenchimento: textos.dialogo.reabrir,
} satisfies Record<AcaoComMotivo, { titulo: string; texto: string; confirmar: string }>;

const comMotivo = (acao: Acao): acao is AcaoComMotivo =>
  acao === "cancelar" || acao === "concluir_pela_recepcao" || acao === "reabrir_preenchimento";

function motivosDe(acao: AcaoComMotivo, status: Status): readonly string[] {
  if (acao === "concluir_pela_recepcao") return MOTIVOS_CONCLUIR;
  if (acao === "reabrir_preenchimento") return MOTIVOS_REABRIR;
  // antes da chegada (Agendado, Ausente) ou depois (PDD §10.2.2); o banco confere a lista pelo estado
  return status === "agendado" || status === "ausente" ? MOTIVOS_CANCELAR_ANTES : MOTIVOS_CANCELAR_DEPOIS;
}

export function useAcoesDaLinha({
  executar,
  depoisDeGravar,
}: {
  /** a server action (executarAcao da Agenda); sem ela, nada grava */
  executar?: ExecutarAcao;
  /** o que reler depois de gravar (a lista, os cards, a seção da Pasta) */
  depoisDeGravar: (acao: EntradaDaAcao["acao"]) => void;
}) {
  const [acionando, setAcionando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<AvisoDaAcao | null>(null);
  const [dialogo, setDialogo] = useState<{ linha: LinhaDaAcao; acao: AcaoComMotivo } | null>(null);
  const [erroDoDialogo, setErroDoDialogo] = useState<string | null>(null);

  const gravou = (acao: EntradaDaAcao["acao"]) => {
    setAviso({ tipo: "ok", texto: textos.resultado.feito[acao] });
    depoisDeGravar(acao);
  };

  const acionar = async (linha: LinhaDaAcao, acao: Acao) => {
    if (!executar) return;
    if (comMotivo(acao)) {
      setErroDoDialogo(null);
      setDialogo({ linha, acao });
      return;
    }
    if (acao !== "confirmar" && acao !== "marcar_ausente") return;
    setAcionando(linha.id);
    setAviso(null);
    const r = await executar({ acao, id: linha.id });
    setAcionando(null);
    if (!r.ok) {
      setAviso({ tipo: "erro", texto: textos.resultado.erro(r.error.reason ?? r.error.code) });
      return;
    }
    gravou(acao);
  };

  const confirmarDialogo = async ({ motivo, justificativa }: { motivo: string; justificativa?: string }) => {
    if (!executar || !dialogo) return;
    const { linha, acao } = dialogo;
    setAcionando(linha.id);
    setErroDoDialogo(null);
    const entrada =
      acao === "concluir_pela_recepcao"
        ? ({ acao, id: linha.id, motivo, justificativa: justificativa ?? "" } as EntradaDaAcao)
        : ({ acao, id: linha.id, motivo } as EntradaDaAcao);
    const r = await executar(entrada);
    setAcionando(null);
    if (!r.ok) {
      setErroDoDialogo(textos.resultado.erro(r.error.reason ?? r.error.code));
      return;
    }
    setDialogo(null);
    gravou(acao);
  };

  const dialogoDaAcao = dialogo ? (
    <DialogoDeMotivo
      titulo={TEXTOS_DO_DIALOGO[dialogo.acao].titulo}
      texto={TEXTOS_DO_DIALOGO[dialogo.acao].texto}
      motivos={motivosDe(dialogo.acao, dialogo.linha.status)}
      rotuloConfirmar={TEXTOS_DO_DIALOGO[dialogo.acao].confirmar}
      justificativaMinima={dialogo.acao === "concluir_pela_recepcao" ? JUSTIFICATIVA_MINIMA : undefined}
      negativo={dialogo.acao === "cancelar"}
      enviando={acionando === dialogo.linha.id}
      erro={erroDoDialogo}
      aoConfirmar={(escolha) => void confirmarDialogo(escolha)}
      aoFechar={() => setDialogo(null)}
    />
  ) : null;

  return { acionando, aviso, acionar, dialogoDaAcao };
}
