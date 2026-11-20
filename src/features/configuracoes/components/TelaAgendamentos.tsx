"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DataState } from "@/components/ui/DataState";
import type { Resultado } from "@/lib/errors";
import type { ChaveDeParametro, Parametro } from "@/server/configuracoes/porta";
import type { DadosDeAgendamentos } from "../queries";
import { textos as t } from "../textos";
import { CaixaDeParametro } from "./CaixaDeParametro";
import { CampoDeParametro } from "./CampoDeParametro";
import { Cartao } from "./Cartao";
import { CelularesDoFluxo } from "./CelularesDoFluxo";

// Configurações › Agendamentos (MIG-42; PDD v206 §10.2.1, §15.5 e §16.3; Simulador ATTA-in, captura 02). Os valores vêm
// do servidor (settings_screen), já com padrão e limites; a tela não repete regra. Ordem dos cartões do simulador
// (capturas 02 e 03); Horário de funcionamento e Pausas entram depois do catálogo (#33).
export function TelaAgendamentos({ resultado }: { resultado: Resultado<DadosDeAgendamentos> | null }) {
  const router = useRouter();
  const [parametros, setParametros] = useState<Parametro[]>(resultado?.ok ? resultado.data.parametros : []);
  const estado = !resultado
    ? ({ tipo: "carregando" } as const)
    : !resultado.ok
      ? ({ tipo: "erro", tentarDeNovo: () => router.refresh() } as const)
      : parametros.length === 0
        ? ({ tipo: "vazio" } as const)
        : ({ tipo: "pronto" } as const);

  const inteiro = (chave: ChaveDeParametro) => {
    const p = parametros.find((x) => x.chave === chave);
    return p?.tipo === "int" ? p : undefined;
  };
  const atualizar = (novo: Parametro) => setParametros((lista) => lista.map((p) => (p.chave === novo.chave ? novo : p)));
  const campo = (chave: ChaveDeParametro, rotulo: string, opcao?: (v: number) => string) => {
    const p = inteiro(chave);
    return p ? <CampoDeParametro parametro={p} rotulo={rotulo} opcao={opcao} aoSalvar={atualizar} /> : null;
  };

  const fluxo = parametros.find((p) => p.chave === "fluxo_alternativo_habilitado");
  const antes = Number(inteiro("link_envio_antecedencia_h")?.valor ?? 0);
  const depois = Number(inteiro("link_validade_apos_h")?.valor ?? 0);
  const total = t.link.total(antes, depois);

  return (
    <section aria-labelledby="titulo-agendamentos">
      <h2 id="titulo-agendamentos" className="sr-only">
        {t.agendamentos.titulo}
      </h2>
      <DataState estado={estado} rotulo={t.agendamentos.rotulo} esqueleto={{ linhas: 5, alturaRem: 12 }} vazio={{ titulo: t.agendamentos.vazio }}>
        <div className="flex flex-col gap-4">
          <Cartao icone="link" titulo={t.link.titulo} subtitulo={t.link.subtitulo} texto={t.link.texto}>
            <div className="grid gap-3 medium:grid-cols-2 large:grid-cols-4">
              {campo("link_envio_antecedencia_h", t.link.envio)}
              {campo("link_validade_apos_h", t.link.validade)}
              {campo("lembrete_1_min", t.link.lembrete1)}
              {campo("lembrete_2_min", t.link.lembrete2)}
            </div>
            <p>
              <strong className="font-semibold">{total.destaque}</strong>
              {total.detalhe}
            </p>
          </Cartao>
          <Cartao icone="confirmacao" titulo={t.confirmacao.titulo} texto={t.confirmacao.texto}>
            <div className="max-w-xs">{campo("janela_de_confirmacao_h", t.confirmacao.campo)}</div>
          </Cartao>
          <Cartao icone="fluxo" titulo={t.fluxo.titulo} subtitulo={t.fluxo.subtitulo} texto={t.fluxo.texto}>
            {fluxo?.tipo === "bool" && (
              <CaixaDeParametro parametro={fluxo} rotulo={t.fluxo.habilitar} ajuda={t.fluxo.habilitado} aoSalvar={atualizar} />
            )}
            {resultado?.ok && <CelularesDoFluxo inicial={resultado.data.celulares} />}
          </Cartao>
          <Cartao icone="ausencia" titulo={t.ausencia.titulo} subtitulo={t.ausencia.subtitulo}>
            <div className="max-w-sm">{campo("tolerancia_da_ausencia_min", t.ausencia.campo, t.ausencia.opcao)}</div>
            <p className="text-text-secondary">{t.ausencia.texto}</p>
          </Cartao>
          <Cartao icone="mensagens" titulo={t.envio.titulo} texto={t.envio.texto} />
        </div>
      </DataState>
    </section>
  );
}
