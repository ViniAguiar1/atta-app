import { iniciais } from "@/lib/texto/iniciais";
import Link from "next/link";
import type { LinhaDePaciente } from "@/server/pacientes/porta";
import { textos } from "../textos";
import { Documento } from "./Documento";

// Tabela da lista de Pacientes, igual ao Simulador ATTA-in (capturas 09 e 10; decisão do dono de 20/11, PLANO "Abas e
// fidelidade ao simulador"): Paciente (avatar, nome, asterisco do nome social e chip de situação), Identificação (documento
// mascarado e "Nasc."), Contato e Atendimento ("Último atendimento" ou "Próximo agendamento", data em negrito e
// "Procedimento · Profissional"). Os números e as datas vêm prontos do servidor. Quem rola de lado é o quadro da tabela.

const PONTO_DO_CHIP = { incompleto: "bg-text-secondary", com_selo: "bg-text-primary", selo_expirado: "bg-status-pending" } as const;

function Chip({ tipo }: { tipo: keyof typeof PONTO_DO_CHIP }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface-card px-2 py-0.5 text-xs font-medium text-text-primary">
      <span aria-hidden="true" className={`size-1.5 rounded-full ${PONTO_DO_CHIP[tipo]}`} />
      {textos.chip[tipo]}
    </span>
  );
}

// régua da área (ORDEM do Tech Lead Frontend): corpo e cabeçalho em 13 px (o cabeçalho em 500), linha secundária em 12 px
const cabecalho = "px-4 py-3 text-left font-medium whitespace-nowrap text-text-primary";
const celula = "px-4 py-3.5 align-top";

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
      <table className="w-full min-w-[60rem] border-collapse text-[0.8125rem]">
        <caption className="sr-only">{textos.tabela}</caption>
        <thead className="border-b border-border bg-surface-app">
          <tr>
            <th scope="col" className={`${cabecalho} w-[36%]`}>{textos.colunas.paciente}</th>
            <th scope="col" className={`${cabecalho} w-[14%]`}>{textos.colunas.identificacao}</th>
            <th scope="col" className={`${cabecalho} w-[20%]`}>{textos.colunas.contato}</th>
            <th scope="col" className={cabecalho}>{textos.colunas.atendimento}</th>
          </tr>
        </thead>
        <tbody className="text-text-primary">
          {pacientes.map((p) => (
            <tr key={p.id} className="border-b border-border last:border-b-0">
              <th scope="row" className={`${celula} text-left font-normal`}>
                <span className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-[2.125rem] shrink-0 items-center justify-center rounded-full bg-surface-card text-xs font-semibold"
                  >
                    {iniciais(p.nome)}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span>
                      {/* o nome abre a Pasta do Paciente; não há botão "Abrir pasta" separado (PDD §10, Pacientes, lista) */}
                      <Link
                        href={`/painel/pacientes/pasta?paciente=${p.id}`}
                        aria-label={textos.abrirPasta(p.nome)}
                        className="underline-offset-2 hover:underline"
                      >
                        {p.nome}
                        {p.usaNomeSocial && <sup aria-hidden="true">*</sup>}
                      </Link>
                      {p.usaNomeSocial && <span className="sr-only">, {textos.nomeSocial}</span>}
                    </span>
                    {p.selo && <Chip tipo={p.selo} />}
                    {p.incompleto && <Chip tipo="incompleto" />}
                  </span>
                </span>
              </th>
              <td className={`${celula} whitespace-nowrap`}>
                <span className="flex flex-col gap-0.5 text-xs">
                  <Documento identificacao={p.identificacao} />
                  {p.nascimento ? (
                    <span>{textos.identificacao.nascimento(p.nascimento)}</span>
                  ) : (
                    <span>
                      <span aria-hidden="true">{textos.identificacao.nascimento(null)}</span>
                      <span className="sr-only">{textos.identificacao.semNascimentoFalado}</span>
                    </span>
                  )}
                </span>
              </td>
              <td className={celula}>
                <span className="flex flex-col gap-0.5">
                  <span className="whitespace-nowrap">{p.contato?.celular ?? textos.semCelular}</span>
                  <span className="text-xs">{p.contato?.email ?? textos.semEmail}</span>
                </span>
              </td>
              <td className={celula}>
                {p.atendimento ? (
                  <span className="flex flex-col gap-0.5">
                    <span className="text-xs">{textos.atendimento.rotulo[p.atendimento.tipo]}</span>
                    <span className="font-semibold whitespace-nowrap">{textos.atendimento.quando(p.atendimento.em)}</span>
                    <span className="text-xs">{textos.atendimento.oQue(p.atendimento.procedimento, p.atendimento.profissional)}</span>
                  </span>
                ) : (
                  <span>{textos.atendimento.nenhum}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
