import type { FichaDoPaciente } from "@/server/pacientes/porta";
import { useId } from "react";
import { CartaoDeSecao } from "@/components/ui/CartaoDeSecao";
import { textos } from "../textos";
import { Documento } from "./Documento";

// Pasta do Paciente, topo (Simulador ATTA-in, captura 12; PDD v206 §10, "Pacientes, lista": o nome abre a Pasta, onde
// ficam o selo e a origem do cadastro): o cartão "Dados cadastrais" e a coluna "Resumo do paciente". O contato chega
// inteiro, porque abrir a Pasta é leitura de dado pessoal registrada na Auditoria (patient_get grava patient.read); a
// lista e o Novo paciente seguem com o contato mascarado (§19.8). Nada de saúde aqui.
// O que a API ainda não traz (endereço, contato de emergência, convênio, carteirinha, atendimentos de hoje, termos e
// pendências) aparece como "—", sem dado de mentira. O lápis "Editar dados" e o "Arquivar paciente" entram com as
// funções de edição e de arquivo; "Vínculos e consentimentos" e "Agendamentos e documentos" vêm nos próximos PRs.

const t = textos.pasta;
const dataBr = (aaaaMmDd: string) => aaaaMmDd.split("-").reverse().join("/");

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    // captura 12: linhas de ~32 px e a coluna do valor a ~35% da largura do cartão
    <div className="grid grid-cols-1 gap-0.5 border-b border-border py-1.5 last:border-b-0 medium:grid-cols-[35%_minmax(0,1fr)] medium:gap-4">
      <dt className="text-xs font-medium text-text-primary">{rotulo}</dt>
      <dd className="text-[0.8125rem] text-text-primary">{children}</dd>
    </div>
  );
}

const SemDado = () => <span className="text-text-secondary">{t.semDado}</span>;

function Selo({ ficha }: { ficha: FichaDoPaciente }) {
  const [titulo, texto] = ficha.selo
    ? [t.selo.com, t.selo.comTexto(ficha.selo.validoAte)]
    : ficha.seloExpirouEm
      ? [t.selo.expirado, t.selo.expiradoTexto(ficha.seloExpirouEm)]
      : [t.selo.sem, t.selo.semTexto];
  return (
    <span className="flex flex-col gap-0.5 text-xs">
      <span>{titulo}</span>
      <span className="text-text-secondary">{texto}</span>
    </span>
  );
}

function DadosCadastrais({ ficha }: { ficha: FichaDoPaciente }) {
  return (
    <CartaoDeSecao titulo={t.dados.titulo} subtitulo={t.dados.subtitulo} icone="👤">
      <dl className="-mt-4 -mb-1.5">
        {ficha.nomeSocial && <Linha rotulo={t.campos.nomeSocial}>{ficha.nomeSocial}</Linha>}
        <Linha rotulo={t.campos.nomeCivil}>{ficha.nomeCivil}</Linha>
        <Linha rotulo={t.campos.identificacao}>
          <Documento identificacao={ficha.identificacao} />
        </Linha>
        <Linha rotulo={t.campos.nascimento}>{ficha.nascimento ? dataBr(ficha.nascimento) : <SemDado />}</Linha>
        <Linha rotulo={t.campos.celular}>{ficha.contato?.celular ?? <span className="text-text-secondary">{textos.semCelular}</span>}</Linha>
        <Linha rotulo={t.campos.email}>{ficha.contato?.email ?? <span className="text-text-secondary">{textos.semEmail}</span>}</Linha>
        <Linha rotulo={t.campos.endereco}><SemDado /></Linha>
        <Linha rotulo={t.campos.emergencia}><SemDado /></Linha>
        <Linha rotulo={t.campos.selo}><Selo ficha={ficha} /></Linha>
        <Linha rotulo={t.campos.convenio}><SemDado /></Linha>
        <Linha rotulo={t.campos.carteirinha}><SemDado /></Linha>
      </dl>
    </CartaoDeSecao>
  );
}

function ItemDoResumo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-2">
      <dt className="text-[0.6875rem] font-semibold tracking-wide text-text-secondary uppercase">{rotulo}</dt>
      <dd className="text-[0.8125rem] text-text-primary">{children}</dd>
    </div>
  );
}

function Resumo({ ficha }: { ficha: FichaDoPaciente }) {
  const incompleto = ficha.identificacao.tipo === "incompleto";
  const titulo = useId();
  return (
    <aside aria-labelledby={titulo} className="flex flex-col gap-4 border-t border-border p-4 large:border-t-0 large:border-l">
      <h2 id={titulo} className="text-[0.6875rem] font-semibold tracking-wide text-text-primary uppercase">
        {t.resumo.titulo}
      </h2>
      <dl className="-mt-2">
        <ItemDoResumo rotulo={t.resumo.paciente}>{ficha.nome}</ItemDoResumo>
        <ItemDoResumo rotulo={t.resumo.identificacao}>
          <Documento identificacao={ficha.identificacao} />
        </ItemDoResumo>
        <ItemDoResumo rotulo={t.resumo.situacao}>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-card px-2 py-0.5 text-xs font-medium">
            <span aria-hidden="true" className={`size-1.5 rounded-full ${incompleto ? "bg-text-secondary" : "bg-text-primary"}`} />
            {incompleto ? textos.chip.incompleto : t.resumo.completo}
          </span>
        </ItemDoResumo>
        <ItemDoResumo rotulo={t.resumo.atendimentosHoje}><SemDado /></ItemDoResumo>
        <ItemDoResumo rotulo={t.resumo.termosAssinados}><SemDado /></ItemDoResumo>
        <ItemDoResumo rotulo={t.resumo.pendencias}><SemDado /></ItemDoResumo>
      </dl>
      <div className="rounded-md border border-border bg-surface-raised p-3 text-xs">
        <p className="font-semibold text-text-primary">{t.registro.titulo}</p>
        <p className="mt-1 text-text-secondary">{t.registro.texto}</p>
      </div>
    </aside>
  );
}

export function PastaDoPaciente({ ficha }: { ficha: FichaDoPaciente }) {
  return (
    // captura 12: os cartões num painel claro com 16 px de respiro; o resumo à direita, separado por uma linha
    <div className="grid grid-cols-1 gap-4 large:grid-cols-[minmax(0,1fr)_16.5rem]">
      <div className="flex min-w-0 flex-col gap-4 rounded-md bg-surface-raised p-4">
        <DadosCadastrais ficha={ficha} />
      </div>
      <Resumo ficha={ficha} />
    </div>
  );
}
