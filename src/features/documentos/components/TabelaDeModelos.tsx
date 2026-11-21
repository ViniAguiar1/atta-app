import type { ModeloDeDocumento } from "@/server/documentos/porta";
import { data, frequencia, mesAno, numero } from "../formatos";
import { NOMES_DOS_TIPOS, textos } from "../textos";
import { MenuDoModelo } from "./MenuDoModelo";

// Tabela de Meus modelos (PDD §10.3.1; simulador, captura 39): Modelo · Procedimentos · Frequência · Recusa impede? ·
// Versão · Assinados, com as larguras medidas na captura 39 (tabela fixa: a coluna não muda com o conteúdo). O menu ⋮ (editar, vincular, publicar, inativar, vindos do servidor) entra com as telas de cada
// ação: botão sem destino fica fora. A página não rola de lado; a tabela rola (Guia §3 e §6), como na Agenda.
export function TabelaDeModelos({ modelos }: { modelos: ModeloDeDocumento[] }) {
  const c = textos.colunas;
  return (
    <div role="region" aria-label={textos.rotuloDaLista} tabIndex={0} className="relative overflow-x-auto rounded-lg border border-border bg-surface-raised">
      <table className="w-full min-w-[60rem] table-fixed border-collapse text-left text-corpo">
        <colgroup>
          {LARGURAS.map((largura, i) => (
            <col key={i} style={{ width: largura }} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-border">
            {[c.modelo, c.procedimentos, c.frequencia, c.recusa, c.versao, c.assinados].map((coluna) => (
              <th key={coluna} scope="col" className="px-4 py-3 font-medium text-text-primary">
                {coluna}
              </th>
            ))}
            <th scope="col" className="px-4 py-3">
              <span className="sr-only">{textos.colunaAcoes}</span>
            </th>
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
              <td className="px-3 py-3">
                <MenuDoModelo modelo={m} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Posições das colunas medidas na captura 39 (tabela de 1436 px): Modelo 404, Procedimentos 280, Frequência 178,
// Recusa impede? 207, Versão 181, Assinados 116 e o ⋮ com o resto.
const LARGURAS = ["28.1%", "19.5%", "12.4%", "14.4%", "12.6%", "8.1%", "4.9%"] as const;

const chip = "inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-border bg-surface-card px-3 py-0.5 text-xs text-text-primary";

function Procedimentos({ procedimentos }: { procedimentos: ModeloDeDocumento["procedimentos"] }) {
  const [primeiro, ...resto] = procedimentos;
  if (!primeiro) return <span className="text-text-secondary">{textos.semValor}</span>;
  return (
    <span className={chip}>
      <span aria-hidden="true" className="size-2 rounded-full bg-status-success" />
      {primeiro.nome}
      {resto.length > 0 && <span className="text-text-secondary">{textos.mais(resto.length)}</span>}
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
      <p className="text-text-primary">
        {modelo.publicadoEm ? textos.versao(modelo.versaoAtual, mesAno(modelo.publicadoEm)) : `v${modelo.versaoAtual}`}
      </p>
      {modelo.publicadoEm && <p className="text-xs text-text-secondary">{textos.desde(data(modelo.publicadoEm))}</p>}
    </>
  );
}
