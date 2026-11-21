import type { Resultado } from "@/lib/errors";
import type { FichaDoPaciente } from "@/server/pacientes/porta";
import { useId } from "react";
import { CartaoDeSecao } from "@/components/ui/CartaoDeSecao";
import { textos } from "../textos";
import { AvisoDeArquivado, BotaoDeArquivar } from "./ArquivarPaciente";
import { Documento } from "./Documento";

// Pasta do Paciente, topo (Simulador ATTA-in, captura 12; PDD v206 §10, "Pacientes, lista": o nome abre a Pasta, onde
// ficam o selo e a origem do cadastro): o cartão "Dados cadastrais" e a coluna "Resumo do paciente". O contato chega
// inteiro, porque abrir a Pasta é leitura de dado pessoal registrada na Auditoria (patient_get grava patient.read); a
// lista e o Novo paciente seguem com o contato mascarado (§19.8). Nada de saúde aqui.
// O que a API ainda não traz (endereço, contato de emergência, convênio, carteirinha, atendimentos de hoje, termos e
// pendências, consentimento do Termo ATTA, responsável e a contagem de respostas de saúde) aparece como "—", sem dado
// de mentira. O lápis "Editar dados" entra com a edição; "Agendamentos e documentos" vem no próximo PR.

const t = textos.pasta;
type Arquivar = (e: { id: string; arquivar: boolean }) => Promise<Resultado<{ arquivado: boolean }>>;
const dataBr = (aaaaMmDd: string) => aaaaMmDd.split("-").reverse().join("/");

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    // captura 12: linhas de ~32 px e a coluna do valor a ~35% da largura do cartão
    <div className="grid grid-cols-1 gap-0.5 border-b border-border py-1.5 last:border-b-0 medium:grid-cols-[35%_minmax(0,1fr)] medium:gap-4">
      <dt className="text-xs font-medium text-text-primary">{rotulo}</dt>
      <dd className="text-corpo leading-normal text-text-primary">{children}</dd>
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

// cadeado de traço fino (Guia de Design §7), decorativo: o "só a contagem" é o que se lê
function Cadeado() {
  return (
    <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function Origem({ ficha }: { ficha: FichaDoPaciente }) {
  const v = t.vinculos;
  const texto = ficha.origem === "recepcao" ? v.recepcao(ficha.vinculadoEm) : ficha.origem === "importacao" ? v.importacao(ficha.vinculadoEm) : v.vinculado(ficha.vinculadoEm);
  return (
    <span className="flex flex-col gap-0.5">
      <span>{texto}</span>
      {ficha.acessoARede === "pendente" && <span className="text-xs text-text-secondary">{v.pendente}</span>}
    </span>
  );
}

// captura 13: origem, Termo ATTA, responsável, respostas de saúde (só a contagem, nunca o conteúdo) e o expansor do conflito
function Vinculos({ ficha }: { ficha: FichaDoPaciente }) {
  const v = t.vinculos;
  return (
    <CartaoDeSecao titulo={v.titulo} subtitulo={v.subtitulo} icone="🔗">
      <dl className="-mt-4 -mb-1.5">
        <Linha rotulo={v.origem}><Origem ficha={ficha} /></Linha>
        <Linha rotulo={v.termoAtta}><SemDado /></Linha>
        <Linha rotulo={v.responsavel}><SemDado /></Linha>
        <Linha rotulo={v.saude}>
          <SemDado />{" "}
          <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
            · <Cadeado /> {v.soContagem}
          </span>
        </Linha>
      </dl>
      <details className="text-xs">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold medium:min-h-8">{v.conflito}</summary>
        <p className="text-text-secondary">{v.conflitoTexto}</p>
      </details>
    </CartaoDeSecao>
  );
}

function ItemDoResumo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-2">
      <dt className="text-rotulo font-semibold tracking-wide text-text-secondary uppercase">{rotulo}</dt>
      <dd className="text-corpo leading-normal text-text-primary">{children}</dd>
    </div>
  );
}

function Resumo({ ficha, arquivar }: { ficha: FichaDoPaciente; arquivar: Arquivar | null }) {
  const incompleto = ficha.identificacao.tipo === "incompleto";
  const titulo = useId();
  return (
    <aside aria-labelledby={titulo} className="flex flex-col gap-4 border-t border-border p-4 large:border-t-0 large:border-l">
      <div className="flex items-center justify-between gap-2">
        <h2 id={titulo} className="text-rotulo font-semibold tracking-wide text-text-primary uppercase">
          {t.resumo.titulo}
        </h2>
        {arquivar && !ficha.arquivadoEm && <BotaoDeArquivar id={ficha.id} arquivar={arquivar} />}
      </div>
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

/** arquivar: a action do servidor, só para o gestor (ADMIN); null para o Colaborador, que não vê o botão. */
export function PastaDoPaciente({ ficha, arquivar = null }: { ficha: FichaDoPaciente; arquivar?: Arquivar | null }) {
  return (
    <div className="flex flex-col gap-4">
      {ficha.arquivadoEm && <AvisoDeArquivado id={ficha.id} arquivadoEm={ficha.arquivadoEm} arquivar={arquivar} />}
      {/* captura 12: os cartões num painel claro com 16 px de respiro; o resumo à direita, separado por uma linha */}
      <div className="grid grid-cols-1 gap-4 large:grid-cols-[minmax(0,1fr)_16.5rem]">
        <div className="flex min-w-0 flex-col gap-4 rounded-md bg-surface-raised p-4">
          <DadosCadastrais ficha={ficha} />
          <Vinculos ficha={ficha} />
        </div>
        <Resumo ficha={ficha} arquivar={arquivar} />
      </div>
    </div>
  );
}
