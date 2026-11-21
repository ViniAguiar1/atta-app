import type { LinhaDaAgenda } from "../schema";
import { dataCurta, finalDoCpf, horario } from "../formatos";
import { textos } from "../textos";
import { ChipDeStatus, SeloAtrasado } from "@/components/agenda/ChipDeStatus";

// Títulos de coluna na fonte do corpo, sem maiúsculas, no verde do ATTA-in (PDD v206 §10, padrões visuais).
// Tabela das visões da Agenda (PDD v206 §10.2.2): Horário ↑, Paciente, Procedimento, Profissional, Documentos e
// Status; na visão Hoje a coluna Data fica oculta, e em Todos e Concluídos ela vem antes do Horário. As linhas já vêm do servidor por horário. A coluna Ações (lápis e ⋮) entra
// com as ações, no PR seguinte: botão que ainda não leva a nada fica de fora.

/** Altura de cada linha (h-16 = 4 rem, a do simulador); o esqueleto do DataState usa a mesma. */
export const ALTURA_DA_LINHA_REM = 4;

type Props = {
  linhas: LinhaDaAgenda[];
  fuso: string;
  ocupado?: boolean;
  /** visões Todos e Concluídos: coluna Data antes do Horário (§10.2.2; capturas 35 e 36) */
  comData?: boolean;
  /** "hoje" da clínica, para a coluna Data dizer "Hoje" */
  hojeLocal?: string;
  /** visão Concluídos: Ausente aparece como "Não realizado" (§10.2.2) */
  ausenteComoNaoRealizado?: boolean;
  /** ordem das linhas, que vem do servidor: crescente (Hoje, Todos) ou decrescente (Concluídos) */
  ordem?: "ascending" | "descending";
};

export function TabelaDoDia({
  linhas,
  fuso,
  ocupado = false,
  comData = false,
  hojeLocal,
  ausenteComoNaoRealizado = false,
  ordem = "ascending",
}: Props) {
  const c = textos.colunas;
  const seta = <span aria-hidden="true">{ordem === "ascending" ? "↑" : "↓"}</span>;
  return (
    // A página não rola de lado: quem rola é a tabela (Guia §3 e §6). Região focável para rolar pelo teclado (axe
    // scrollable-region-focusable); o relative prende os sr-only dentro dela.
    <div
      role="region"
      aria-label={textos.rotuloDaLista}
      tabIndex={0}
      aria-busy={ocupado || undefined}
      className="relative overflow-x-auto rounded-md border border-border bg-surface-raised"
    >
      <table className="w-full min-w-[56rem] border-collapse text-left text-corpo">
        <thead>
          <tr className="border-b border-border">
            {comData && (
              <th scope="col" aria-sort={ordem} className="px-4 py-3 font-medium whitespace-nowrap text-brand">
                {c.data} {seta}
              </th>
            )}
            <th
              scope="col"
              aria-sort={comData ? undefined : ordem}
              className="px-4 py-3 font-medium whitespace-nowrap text-brand"
            >
              {c.horario} {!comData && seta}
            </th>
            {[c.paciente, c.procedimento, c.profissional, c.documentos, c.status].map((coluna) => (
              <th key={coluna} scope="col" className="px-4 py-3 font-medium text-brand">
                {coluna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <Linha
              key={linha.id}
              linha={linha}
              fuso={fuso}
              data={comData ? dataCurta(linha.inicio, fuso, hojeLocal) : null}
              ausenteComoNaoRealizado={ausenteComoNaoRealizado}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Linha({
  linha,
  fuso,
  data,
  ausenteComoNaoRealizado,
}: {
  linha: LinhaDaAgenda;
  fuso: string;
  data: string | null;
  ausenteComoNaoRealizado: boolean;
}) {
  const { paciente } = linha;
  return (
    <tr data-linha={linha.id} className="h-16 border-b border-border last:border-b-0">
      {data !== null && <td className="px-4 py-3 whitespace-nowrap text-text-secondary">{data}</td>}
      <td className="px-4 py-3 font-sub text-[1.0625rem] font-semibold whitespace-nowrap">{horario(linha.inicio, fuso)}</td>
      <th scope="row" className="px-4 py-3 font-normal">
        <span className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-card text-xs font-medium"
          >
            {paciente.iniciais}
          </span>
          <span className="flex flex-col">
            <span>{paciente.nomeExibicao}</span>
            <Cpf mascarado={paciente.cpfMascarado} />
          </span>
        </span>
      </th>
      <td className="px-4 py-3">
        {linha.servicos.map((s) => s.nome).join(", ")}
        {/* Concluído: o procedimento é o realizado (§10.2.2; captura 36) */}
        {linha.status === "concluido" && <span className="block text-xs text-text-secondary">{textos.realizado}</span>}
      </td>
      <td className="px-4 py-3">{linha.profissional.nomeExibicao}</td>
      <td className="px-4 py-3">
        <Documentos documentos={linha.documentos} />
      </td>
      <td className="px-4 py-3">
        <Status linha={linha} fuso={fuso} ausenteComoNaoRealizado={ausenteComoNaoRealizado} />
      </td>
    </tr>
  );
}

/** CPF como o servidor manda (ADR 0002 §6): o visual escondido do leitor, que ouve "CPF terminado em 247-25". */
function Cpf({ mascarado }: { mascarado: string | null }) {
  if (!mascarado) return <span className="text-xs text-text-secondary">{textos.semCpf}</span>;
  return (
    <span className="text-xs text-text-secondary">
      <span aria-hidden="true">{mascarado}</span>
      <span className="sr-only">{textos.cpfTerminadoEm(finalDoCpf(mascarado))}</span>
    </span>
  );
}

function Documentos({ documentos }: { documentos: LinhaDaAgenda["documentos"] }) {
  const d = textos.documento;
  if (documentos.length === 0) return <span className="text-text-secondary">{d.nenhum}</span>;
  return (
    <ul className="flex flex-col gap-1">
      {documentos.map((doc) => (
        <li key={doc.id} className="flex gap-2">
          <span aria-hidden="true" className={doc.estado === "recusado" ? "text-status-negative" : undefined}>
            {d[doc.estado].simbolo}
          </span>
          <span>
            {doc.nome}
            <span className="sr-only">, {d[doc.estado].estado}</span>
            {doc.opcional && <span className="text-xs text-text-secondary"> {d.opcional}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Status({
  linha,
  fuso,
  ausenteComoNaoRealizado,
}: {
  linha: LinhaDaAgenda;
  fuso: string;
  ausenteComoNaoRealizado: boolean;
}) {
  const aguardandoConfirmacao = linha.status === "agendado" && linha.confirmacao === "a_confirmar";
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="flex flex-wrap items-center gap-1.5">
        <ChipDeStatus
          status={linha.status}
          rotulo={ausenteComoNaoRealizado && linha.status === "ausente" ? textos.naoRealizado : undefined}
        />
        {linha.atrasado && <SeloAtrasado />}
      </span>
      {linha.status === "agendado" && linha.confirmacao === "confirmado" && (
        <span className="text-xs text-status-info">{textos.confirmado}</span>
      )}
      {aguardandoConfirmacao && <span className="text-xs text-text-secondary">{textos.confirmarOuCancelar}</span>}
      {linha.boardingCheckEnviadoEm && (linha.status === "pronto" || linha.status === "em_atendimento") && (
        <span className="text-xs text-text-secondary">
          {textos.boardingCheckEnviado(horario(linha.boardingCheckEnviadoEm, fuso))}
        </span>
      )}
    </div>
  );
}
