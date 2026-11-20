import type { LinhaDaAgenda } from "../schema";
import { finalDoCpf, horario } from "../formatos";
import { textos } from "../textos";
import { ChipDeStatus, SeloAtrasado } from "./ChipDeStatus";

// Tabela da visão Hoje (PDD v206 §10.2.2): Horário ↑, Paciente, Procedimento, Profissional, Documentos e Status; na
// visão Hoje a coluna Data fica oculta. As linhas já vêm do servidor por horário. A coluna Ações (lápis e ⋮) entra
// com as ações, no PR seguinte: botão que ainda não leva a nada fica de fora.

/** Altura de cada linha (h-16 = 4 rem, a do simulador); o esqueleto do DataState usa a mesma. */
export const ALTURA_DA_LINHA_REM = 4;

export function TabelaDoDia({ linhas, fuso }: { linhas: LinhaDaAgenda[]; fuso: string }) {
  const c = textos.colunas;
  return (
    // A página não rola de lado: quem rola é a tabela (Guia §3 e §6). Região focável para rolar pelo teclado (axe
    // scrollable-region-focusable); o relative prende os sr-only dentro dela.
    <div
      role="region"
      aria-label={textos.rotuloDaLista}
      tabIndex={0}
      className="relative overflow-x-auto rounded-md border border-border bg-surface-raised"
    >
      <table className="w-full min-w-[56rem] border-collapse text-left">
        <thead className="text-sm">
          <tr className="border-b border-border">
            <th scope="col" aria-sort="ascending" className="px-4 py-3 font-medium whitespace-nowrap">
              {c.horario} <span aria-hidden="true">↑</span>
            </th>
            {[c.paciente, c.procedimento, c.profissional, c.documentos, c.status].map((coluna) => (
              <th key={coluna} scope="col" className="px-4 py-3 font-medium">
                {coluna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <Linha key={linha.id} linha={linha} fuso={fuso} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Linha({ linha, fuso }: { linha: LinhaDaAgenda; fuso: string }) {
  const { paciente } = linha;
  return (
    <tr data-linha={linha.id} className="h-16 border-b border-border last:border-b-0">
      <td className="px-4 py-3 font-sub text-lg whitespace-nowrap">{horario(linha.inicio, fuso)}</td>
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
      <td className="px-4 py-3">{linha.servicos.map((s) => s.nome).join(", ")}</td>
      <td className="px-4 py-3">{linha.profissional.nomeExibicao}</td>
      <td className="px-4 py-3">
        <Documentos documentos={linha.documentos} />
      </td>
      <td className="px-4 py-3">
        <Status linha={linha} fuso={fuso} />
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
    <ul className="flex flex-col gap-1 text-sm">
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

function Status({ linha, fuso }: { linha: LinhaDaAgenda; fuso: string }) {
  const aguardandoConfirmacao = linha.status === "agendado" && linha.confirmacao === "a_confirmar";
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="flex flex-wrap items-center gap-1.5">
        <ChipDeStatus status={linha.status} />
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
