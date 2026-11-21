import type { ModeloDeDocumento } from "@/server/documentos/porta";
import { data, frequencia, numero } from "../formatos";
import { NOMES_DOS_TIPOS, textos } from "../textos";

// Tabela de Meus modelos (PDD §10.3.1; simulador, captura 39): Modelo · Procedimentos · Frequência · Recusa impede? ·
// Versão · Assinados. O menu ⋮ (editar, vincular, publicar, inativar, vindos do servidor) entra com as telas de cada
// ação: botão sem destino fica fora. A página não rola de lado; a tabela rola (Guia §3 e §6), como na Agenda.
export function TabelaDeModelos({ modelos }: { modelos: ModeloDeDocumento[] }) {
  const c = textos.colunas;
  return (
    <div role="region" aria-label={textos.rotuloDaLista} tabIndex={0} className="relative overflow-x-auto rounded-xl border border-border bg-surface-raised">
      <table className="w-full min-w-[60rem] border-collapse text-left text-[0.8125rem]">
        <thead>
          <tr className="border-b border-border">
            {[c.modelo, c.procedimentos, c.frequencia, c.recusa, c.versao, c.assinados].map((coluna) => (
              <th key={coluna} scope="col" className="px-4 py-3 font-medium text-text-primary">
                {coluna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {modelos.map((m) => (
            <tr key={m.id} className="border-b border-border align-top last:border-b-0">
              <td className="px-4 py-3">
                <p className="text-text-primary">{m.titulo}</p>
                <p className="text-xs text-text-secondary">{NOMES_DOS_TIPOS[m.tipo]}</p>
              </td>
              <td className="px-4 py-3">
                <Procedimentos procedimentos={m.procedimentos} />
              </td>
              <td className="px-4 py-3 text-text-primary">{frequencia(m)}</td>
              <td className="px-4 py-3">
                <Recusa obrigatorio={m.obrigatorio} />
              </td>
              <td className="px-4 py-3">
                <Versao modelo={m} />
              </td>
              <td className="px-4 py-3 text-text-primary">{numero(m.assinados)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const chip = "inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-border bg-surface-card px-3 py-0.5 text-xs text-text-primary";

function Procedimentos({ procedimentos }: { procedimentos: ModeloDeDocumento["procedimentos"] }) {
  if (procedimentos.length === 0) return <span className="text-text-secondary">{textos.semValor}</span>;
  const primeiro = procedimentos[0]?.nome;
  return (
    <span className={chip}>
      <span aria-hidden="true" className="size-2 rounded-full bg-status-success" />
      {primeiro ? (
        <>
          {primeiro}
          {procedimentos.length > 1 && <span className="text-text-secondary">{textos.mais(procedimentos.length - 1)}</span>}
        </>
      ) : (
        textos.procedimentosSemNome(procedimentos.length)
      )}
    </span>
  );
}

function Recusa({ obrigatorio }: { obrigatorio: boolean | null }) {
  if (obrigatorio === null) return <span className="text-text-secondary">{textos.semValor}</span>;
  return (
    <span className={`${chip} border-transparent font-medium`}>
      <span aria-hidden="true" className={`size-2 rounded-full ${obrigatorio ? "bg-status-negative" : "bg-text-tertiary"}`} />
      {obrigatorio ? textos.obrigatorio : textos.opcional}
    </span>
  );
}

function Versao({ modelo }: { modelo: ModeloDeDocumento }) {
  if (modelo.versaoAtual === null) return <span className="text-text-secondary">{textos.rascunho}</span>;
  return (
    <>
      <p className="text-text-primary">{textos.versao(modelo.versaoAtual)}</p>
      {modelo.publicadoEm && <p className="text-xs text-text-secondary">{textos.desde(data(modelo.publicadoEm))}</p>}
    </>
  );
}
