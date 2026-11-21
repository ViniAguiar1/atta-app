import type { Pergunta, Resposta, Valor } from "@/lib/saude/schema";
import { textos } from "./textos";

// Leitura das respostas do Formulário de Saúde (MIG-52; PDD v206 §10.3.2, RN-FSA-02, RN-FSA-10, RN-FSA-14, RN-R-02), o
// único renderizador: o paciente confere o que respondeu e o profissional lê no Boarding Check (Seção 1, MIG-53b). Só
// leitura, sem campo nem ação. "Prefiro não responder" aparece sinalizado; o destaque da clínica aparece como texto, sem
// interpretação, recomendação nem bloqueio. A pergunta condicional que não se aplica não aparece. Nunca resposta em URL,
// log ou print.
type Props = {
  perguntas: Pergunta[];
  respostas: Resposta[];
  /** RN-FSA-14: só no Boarding Check (o paciente não vê os destaques da clínica). */
  destaques?: Record<string, string>;
};

export function RespostasDoFormulario({ perguntas, respostas, destaques = {} }: Props) {
  const porPergunta = new Map(respostas.map((r) => [r.perguntaId, r]));
  const visiveis = perguntas.filter((p) => aplicavel(p, porPergunta));
  return (
    <dl aria-label={textos.titulo} className="flex flex-col divide-y divide-border rounded-md border border-border bg-surface-raised text-lg">
      {visiveis.map((p) => {
        const resposta = porPergunta.get(p.id);
        const destaque = destaques[p.id];
        return (
          <div key={p.id} className="flex flex-col gap-1.5 px-4 py-3">
            <dt className="font-medium text-text-primary">{p.texto}</dt>
            <dd className="flex flex-col items-start gap-1.5">
              {!resposta ? (
                <span className="text-text-secondary">{textos.semResposta}</span>
              ) : resposta.recusada ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-border-functional px-3 py-0.5 text-base font-medium text-text-primary">
                  <svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M8 12h8" />
                  </svg>
                  {textos.recusada}
                </span>
              ) : (
                <span className="text-text-primary">{formatar(p, resposta.valor)}</span>
              )}
              {destaque && (
                <span className="inline-flex items-center gap-2 rounded-md border-l-4 border-brand bg-surface-card px-3 py-1 text-base text-text-primary">
                  <span className="sr-only">{textos.destaque}: </span>
                  {destaque}
                </span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Lógica condicional: sem condição, sempre; com condição, só quando a resposta da pergunta de origem bate. */
function aplicavel(p: Pergunta, respostas: Map<string, Resposta>): boolean {
  if (!p.condicao) return true;
  const origem = respostas.get(p.condicao.perguntaId);
  if (!origem || origem.recusada) return false;
  const v = origem.valor;
  if (v.tipo === "sim_nao") return (v.valor ? "sim" : "nao") === p.condicao.resposta;
  if (v.tipo === "opcoes") return v.valores.includes(p.condicao.resposta);
  return false;
}

/** O valor em texto de leitura, pelos rótulos da pergunta (nunca o id). */
export function formatar(p: Pergunta, v: Valor): string {
  const rotulo = (lista: { id: string; rotulo: string }[] | undefined, id: string) => lista?.find((o) => o.id === id)?.rotulo ?? id;
  if (v.tipo === "aberta") return v.texto;
  if (v.tipo === "opcoes") {
    const partes = v.valores.map((id) => rotulo(p.opcoes, id));
    if (v.outro) partes.push(textos.outro(v.outro));
    return partes.join(", ");
  }
  if (!v.valor) return textos.nao;
  const detalhes = [...(v.subOpcoes ?? []).map((id) => rotulo(p.subOpcoes?.opcoes, id)), ...(v.digitadas ?? [])];
  return detalhes.length ? `${textos.sim}: ${detalhes.join(", ")}` : textos.sim;
}
