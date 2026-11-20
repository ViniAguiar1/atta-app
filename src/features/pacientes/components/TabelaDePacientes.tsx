import { iniciais } from "@/lib/texto/iniciais";
import type { Identificacao, LinhaDePaciente, MarcaDeDocumento } from "@/server/pacientes/porta";
import { textos } from "../textos";

// Tabela da lista de Pacientes. Colunas do PDD v206 §10 ("Pacientes, lista"): Paciente, Identificação, Contato, Último
// atendimento e Documentos; selo, origem e Formulário de Saúde ficam fora, na Pasta. Formato das células: Simulador,
// capturas 09 e 10 (avatar com iniciais, chip "Incompleto", asterisco do nome social, "Nasc." embaixo do CPF). Títulos de
// coluna na fonte do corpo, sem maiúsculas, no verde do ATTA-in (§10, "Padrões visuais"). Marcadores de documento do
// §10.2.2. A página não rola de lado: quem rola é o quadro da tabela (§10 e Guia de Design §3).

// o que fica à mostra na máscara única (ADR 0002 §6): "···.···.247-25" → "247-25"; "······A12" → "A12"
const final = (mascarado: string) => mascarado.replace(/^[·.]+/, "");

function Documento({ identificacao }: { identificacao: Identificacao }) {
  if (identificacao.tipo === "incompleto") return <span className="text-text-secondary">{textos.identificacao.semDocumento}</span>;
  const cpf = identificacao.tipo === "cpf";
  const falado = cpf
    ? textos.identificacao.cpfFalado(final(identificacao.mascarado))
    : textos.identificacao.estrangeiroFalado(final(identificacao.mascarado));
  // o visual fica escondido do leitor de tela, que ouve o texto por extenso (padrão do painel, #29 e #44)
  return (
    <span>
      <span aria-hidden="true">{cpf ? identificacao.mascarado : `${textos.identificacao.estrangeiro} ${identificacao.mascarado}`}</span>
      <span className="sr-only">{falado}</span>
    </span>
  );
}

const SIMBOLO: Record<MarcaDeDocumento, string> = { vinculado: "●", assinado: "✓", recusado: "✗" };
const COR: Record<MarcaDeDocumento, string> = {
  vinculado: "text-text-secondary",
  assinado: "text-text-primary",
  recusado: "text-status-negative",
};

const cabecalho = "px-4 py-3 text-left font-medium text-brand whitespace-nowrap";
const celula = "px-4 py-3 align-top";
const secundario = "text-text-secondary";

export function TabelaDePacientes({ pacientes }: { pacientes: LinhaDePaciente[] }) {
  return (
    // região focável: quem usa teclado também rola a tabela de lado (axe scrollable-region-focusable); o relative prende
    // os sr-only dentro dela
    <div
      role="region"
      aria-label={textos.tabela}
      tabIndex={0}
      className="relative overflow-x-auto rounded-md border border-border bg-surface-raised"
    >
      <table className="w-full min-w-[60rem] border-collapse text-sm">
        <caption className="sr-only">{textos.tabela}</caption>
        <thead className="border-b border-border bg-surface-app">
          <tr>
            <th scope="col" className={cabecalho}>{textos.colunas.paciente}</th>
            <th scope="col" className={cabecalho}>{textos.colunas.identificacao}</th>
            <th scope="col" className={cabecalho}>{textos.colunas.contato}</th>
            <th scope="col" className={cabecalho}>{textos.colunas.ultimoAtendimento}</th>
            <th scope="col" className={cabecalho}>{textos.colunas.documentos}</th>
          </tr>
        </thead>
        <tbody>
          {pacientes.map((p) => (
            <tr key={p.id} className="border-b border-border last:border-b-0">
              <th scope="row" className={`${celula} text-left font-normal`}>
                <span className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-card text-xs font-semibold text-text-primary"
                  >
                    {iniciais(p.nome)}
                  </span>
                  <span className="text-base text-text-primary">
                    {p.nome}
                    {p.usaNomeSocial && (
                      <>
                        <span aria-hidden="true">*</span>
                        <span className="sr-only">, {textos.nomeSocial}</span>
                      </>
                    )}
                  </span>
                  {p.incompleto && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-card px-2.5 py-0.5 text-xs font-medium text-text-primary">
                      <span aria-hidden="true" className="size-1.5 rounded-full bg-text-secondary" />
                      {textos.incompleto}
                    </span>
                  )}
                </span>
              </th>
              <td className={`${celula} whitespace-nowrap`}>
                <span className="flex flex-col">
                  <Documento identificacao={p.identificacao} />
                  {p.nascimento ? (
                    <span className={secundario}>{textos.identificacao.nascimento(p.nascimento)}</span>
                  ) : (
                    <span className={secundario}>
                      <span aria-hidden="true">{textos.identificacao.nascimento(null)}</span>
                      <span className="sr-only">{textos.identificacao.semNascimentoFalado}</span>
                    </span>
                  )}
                </span>
              </td>
              <td className={celula}>
                <span className="flex flex-col">
                  <span className={p.contato?.celular ? "whitespace-nowrap" : secundario}>{p.contato?.celular ?? textos.semCelular}</span>
                  <span className={p.contato?.email ? "" : secundario}>{p.contato?.email ?? textos.semEmail}</span>
                </span>
              </td>
              <td className={celula}>
                {p.ultimoAtendimento ? (
                  <span className="flex flex-col">
                    <span className="font-semibold whitespace-nowrap text-text-primary">{textos.atendimento.quando(p.ultimoAtendimento.em)}</span>
                    <span className={secundario}>
                      {textos.atendimento.oQue(p.ultimoAtendimento.procedimento, p.ultimoAtendimento.profissional)}
                    </span>
                  </span>
                ) : (
                  <span className={secundario}>{textos.atendimento.nenhum}</span>
                )}
              </td>
              <td className={celula}>
                {p.documentos.length === 0 ? (
                  <span className={secundario}>{textos.nenhumDocumento}</span>
                ) : (
                  <ul className="flex flex-col gap-0.5">
                    {p.documentos.map((d, i) => (
                      // a porta ainda não traz id do documento (MIG-20); nome + posição não repete
                      <li key={`${i}-${d.nome}`} className="flex items-baseline gap-2">
                        <span aria-hidden="true" className={COR[d.marca]}>{SIMBOLO[d.marca]}</span>
                        <span>
                          {d.nome}
                          <span className="sr-only">, {textos.marca[d.marca]}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
