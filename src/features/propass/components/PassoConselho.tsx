"use client";

import { Botao } from "@/components/ui/Botao";
import { TituloDoPasso } from "@/components/ui/TituloDoPasso";
import { hora } from "../formatos";
import type { DadosDoProfissional } from "../schema";
import { NOMES_DOS_CONSELHOS, TEXTOS } from "../textos";

// Passo 2 do PROpass: Camada 1 — Validação ATTA (Conselho) (PDD §10.4.3; simulador, captura 25). Só mostra a situação
// que o backend devolveu. Sem comprovante: o PDD diz que "não há envio de comprovante do conselho pelo profissional"
// (o simulador pede um; divergência levada ao CTO). A consulta à base do conselho é externa e espera a PO (R20).
// `consultadoEm` só existe com consulta real; sem ela (nao_consultado, R20), a tela não afirma a regularidade.
type Props = {
  dados: DadosDoProfissional;
  consultadoEm: string | null;
  fuso: string;
  ocupado: boolean;
  erro: string | null;
  aoVoltar: () => void;
  aoContinuar: () => void;
};

export function PassoConselho({ dados, consultadoEm, fuso, ocupado, erro, aoVoltar, aoContinuar }: Props) {
  const conselho = NOMES_DOS_CONSELHOS[dados.conselho as keyof typeof NOMES_DOS_CONSELHOS] ?? dados.conselho;
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-base font-medium uppercase tracking-wide text-text-secondary">{TEXTOS.passo2}</p>
        <TituloDoPasso>{TEXTOS.camada1}</TituloDoPasso>
      </div>
      <h2 className="text-xl font-medium">{TEXTOS.situacaoTitulo}</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <dt className="text-text-secondary">{TEXTOS.colunaConselho}</dt>
        <dd>{conselho}</dd>
        <dt className="text-text-secondary">{TEXTOS.colunaRegistro}</dt>
        <dd>{`${dados.numero}-${dados.uf}`}</dd>
        <dt className="text-text-secondary">{TEXTOS.colunaNome}</dt>
        <dd>{dados.nome}</dd>
      </dl>
      {consultadoEm ? (
        <p className="flex flex-wrap items-center gap-3 rounded-md border border-status-success px-4 py-3">
          <span className="rounded-full bg-status-success px-3 py-1 font-medium text-text-primary">{TEXTOS.regularizado}</span>
          <span className="text-text-secondary">{TEXTOS.consultadoEm(hora(consultadoEm, fuso))}</span>
        </p>
      ) : (
        <p className="rounded-md border border-border-functional px-4 py-3">{TEXTOS.naoConsultado}</p>
      )}
      {erro && (
        <p role="alert" className="text-status-negative">
          {erro}
        </p>
      )}
      <Botao onClick={aoContinuar} disabled={ocupado}>
        {ocupado ? TEXTOS.carregando : TEXTOS.continuar}
      </Botao>
      <Botao variante="secundario" onClick={aoVoltar} disabled={ocupado}>
        {TEXTOS.voltar}
      </Botao>
    </section>
  );
}
