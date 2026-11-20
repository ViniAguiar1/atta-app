import type { ResumoDoAtendimento } from "@/server/boarding/porta";
import { TEXTOS } from "../textos";

// Topo do Boarding Check: resumo do paciente (PDD §10.2.3: identificação, tipo de atendimento, histórico de
// comparecimento). As 4 seções (Formulário de Saúde, Termos, Registro do atendimento, Docs Clínicos) entram nos PRs
// empilhados do MIG-53.
export function Cabecalho({ resumo }: { resumo: ResumoDoAtendimento }) {
  const { paciente, horario, tipoDeAtendimento, comparecimento } = resumo;
  return (
    <section aria-labelledby="boarding-titulo" className="flex flex-col gap-4">
      <h1 id="boarding-titulo" className="font-title text-3xl leading-tight text-text-primary">
        {TEXTOS.titulo}
      </h1>
      <div className="flex flex-col gap-1">
        <p className="text-2xl font-medium">{paciente.nome}</p>
        <p className="text-text-secondary">{TEXTOS.anos(paciente.idade)}</p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <dt className="text-text-secondary">{TEXTOS.rotuloHorario}</dt>
        <dd>{horario}</dd>
        <dt className="text-text-secondary">{TEXTOS.rotuloTipo}</dt>
        <dd>{tipoDeAtendimento}</dd>
        <dt className="text-text-secondary">{TEXTOS.rotuloComparecimento}</dt>
        <dd>{TEXTOS.comparecimento(comparecimento.atendimentos, comparecimento.ausencias)}</dd>
      </dl>
    </section>
  );
}
