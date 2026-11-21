import Link from "next/link";
import { CartaoDeSecao } from "@/components/ui/CartaoDeSecao";
import type { Resultado } from "@/lib/errors";
import type { MeusModelos } from "@/server/documentos/tipos";
import { textos } from "../textos";

const t = textos.validade;

// "Validade documental" (simulador, captura 46; decisão do CTO, R46): só leitura dos modelos "Única" ativos, com a
// validade vigente (3, 6 ou 12 meses ou indeterminada, PDD RN-V-01), pela porta de Termos & Docs
// (api.atta_in_template_list). A validade muda numa nova versão do modelo, em Termos & Docs: nada de edição aqui, para
// não haver dois lugares que mudam a mesma regra. Cada linha leva a Termos & Docs (que ainda não tem rota por modelo).
// No celular a tabela rola sozinha; o contêiner é focável e tem nome (axe: scrollable-region-focusable).
export function ValidadeDocumental({ modelos }: { modelos: Resultado<MeusModelos> }) {
  const unicos = modelos.ok ? modelos.data.modelos.filter((m) => m.frequencia === "unica" && m.estado === "ativo") : [];
  const porProcedimento = modelos.ok
    ? modelos.data.modelos.filter((m) => m.frequencia === "por_procedimento" && m.estado === "ativo").map((m) => m.titulo)
    : [];
  return (
    <CartaoDeSecao nivel={3} titulo={t.titulo} subtitulo={t.subtitulo} icone="⏳" texto={t.texto}>
      {!modelos.ok ? (
        <p role="alert" className="text-status-negative">
          {t.erro}
        </p>
      ) : unicos.length === 0 ? (
        <p className="text-text-secondary">{t.nenhum}</p>
      ) : (
        <div role="region" aria-label={t.legenda} tabIndex={0} className="relative overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-120 text-left">
            <caption className="sr-only">{t.legenda}</caption>
            <thead className="bg-surface-app font-medium">
              <tr className="border-b border-border">
                <th scope="col" className="px-3 py-2.5">{t.colunas.modelo}</th>
                <th scope="col" className="px-3 py-2.5">{t.colunas.estado}</th>
                <th scope="col" className="px-3 py-2.5">{t.colunas.validade}</th>
                <th scope="col" className="px-3 py-2.5">{t.colunas.obrigatorio}</th>
                <th scope="col" className="px-3 py-2.5">
                  <span className="sr-only">{t.abrir}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {unicos.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-b-0">
                  <th scope="row" className="px-3 py-3 font-semibold">
                    {m.titulo}
                    {m.versaoAtual !== null && <span className="ml-1.5 text-xs font-normal text-text-secondary">{t.versao(m.versaoAtual)}</span>}
                  </th>
                  <td className="px-3 py-3">{t.estados[m.estado]}</td>
                  <td className="px-3 py-3">{t.meses(m.validadeMeses)}</td>
                  <td className="px-3 py-3">{m.obrigatorio === null ? t.obrigatorio.semEscolha : m.obrigatorio ? t.obrigatorio.sim : t.obrigatorio.nao}</td>
                  <td className="px-3 py-3 text-right">
                    <Link href="/painel/documentos" aria-label={t.abrirFalado(m.titulo)} className="inline-flex min-h-11 items-center underline underline-offset-2 medium:min-h-8">
                      {t.abrir}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {porProcedimento.length > 0 && <p className="text-xs text-text-secondary">{t.porProcedimento(porProcedimento)}</p>}
    </CartaoDeSecao>
  );
}
