"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Botao } from "@/components/ui/Botao";
import { TituloDoPasso } from "@/components/ui/TituloDoPasso";
import type { TermoNaTela } from "../schema";
import { TEXTOS } from "../textos";
import { QuadroDeAssinatura } from "./QuadroDeAssinatura";

// Passo 3 do PROpass: Termo de Autorização (PDD §10.4.3; simulador, captura 26). O texto vem do servidor (versão
// vigente do modelo de sistema, com os dados do profissional). O quadro só abre depois da leitura até o fim da caixa
// rolável; texto curto, que cabe sem rolar, já conta como lido. O botão muda quando a leitura termina. Guarda quando o
// termo apareceu e quando a leitura terminou, que vão no pacote do ATTA Sign. Quem já tem a senha envia daqui mesmo.
export type Leitura = { abertoEm: string; rolagemCompletaEm: string };
type Props = {
  termo: TermoNaTela;
  /** O rótulo do botão quando a leitura termina: "Assinar o termo" ou, sem o passo da senha, "Concluir o PROpass". */
  rotuloDoBotao: string;
  aoVoltar: () => void;
  /** Devolve o erro para mostrar aqui, ou null quando o fluxo seguiu. */
  aoAssinar: (png: string, leitura: Leitura) => Promise<string | null>;
};

export function PassoTermo({ termo, rotuloDoBotao, aoVoltar, aoAssinar }: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const [abertoEm] = useState(() => new Date().toISOString());
  const [rolagemCompletaEm, setRolagemCompletaEm] = useState<string | null>(null);
  const leu = rolagemCompletaEm !== null;
  const [png, setPng] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, executar] = useTransition();

  const conferirLeitura = () => {
    const c = caixa.current;
    if (c && c.scrollTop + c.clientHeight >= c.scrollHeight - 4) setRolagemCompletaEm((atual) => atual ?? new Date().toISOString());
  };
  useEffect(conferirLeitura, []);

  function assinar() {
    if (!png) return setErro(TEXTOS.semAssinatura);
    if (!rolagemCompletaEm) return;
    executar(async () => setErro(await aoAssinar(png, { abertoEm, rolagemCompletaEm })));
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-base font-medium uppercase tracking-wide text-text-secondary">{TEXTOS.passo3}</p>
        <TituloDoPasso>{termo.titulo}</TituloDoPasso>
        <p>{TEXTOS.termoIntro}</p>
      </div>
      <div
        ref={caixa}
        role="region"
        aria-label={TEXTOS.rotuloTermo}
        tabIndex={0}
        onScroll={conferirLeitura}
        className="flex max-h-80 flex-col gap-3 overflow-y-auto rounded-md border border-border bg-surface-raised p-4 text-base"
      >
        <h2 className="font-medium">{termo.titulo}</h2>
        {termo.paragrafos.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {!leu && <p className="text-base text-text-secondary">{TEXTOS.leiaAteOFim}</p>}
      <QuadroDeAssinatura
        desabilitado={!leu}
        aoMudar={(novo) => {
          setPng(novo);
          if (novo) setErro(null);
        }}
      />
      {erro && (
        <p role="alert" className="text-status-negative">
          {erro}
        </p>
      )}
      <Botao onClick={assinar} disabled={!leu || ocupado}>
        {ocupado ? TEXTOS.enviando : leu ? rotuloDoBotao : TEXTOS.botaoBloqueado}
      </Botao>
      <Botao variante="secundario" onClick={aoVoltar} disabled={ocupado}>
        {TEXTOS.voltar}
      </Botao>
    </section>
  );
}
