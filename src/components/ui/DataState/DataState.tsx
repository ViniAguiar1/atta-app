import type { ReactNode } from "react";
import { textos } from "./textos";

// O único componente que desenha os quatro estados de dados (planning/05 §4.5, planning/08 §9.4, ATIN-160): toda
// lista ou painel que carrega dados passa o estado para cá, e a tela só desenha o conteúdo em "pronto". Assim os
// quatro estados são testados uma vez aqui, e cada tela só prova que usa o DataState (4 + N testes, não 4 × N).
//
// As ações vivem dentro do estado: um erro não existe sem "tentar de novo", nem um "sem resultado" sem "limpar
// filtros". O tipo recusa a tela que esquecer a saída.
export type EstadoDeDados =
  | { tipo: "carregando" }
  | { tipo: "vazio" }
  | { tipo: "sem-resultado"; limparFiltros: () => void }
  | { tipo: "erro"; tentarDeNovo: () => void; codigo?: string }
  | { tipo: "pronto" };

export type Vazio = {
  titulo: string;
  texto?: string;
  /**
   * zero state com ação primária (planning/05 §4.5): o que a pessoa faz para a lista deixar de estar vazia. Só fica de
   * fora enquanto a ação não existe no painel (o Agendar depende do modal de agendamento): botão que não leva a nada
   * é pior que nenhum.
   */
  acao?: { rotulo: string; aoClicar: () => void };
};

export type Esqueleto = {
  /** quantas linhas o conteúdo costuma ter na primeira dobra */
  linhas: number;
  /** altura de cada linha em rem, a mesma do conteúdo: trocar o esqueleto pelo conteúdo não desloca a tela */
  alturaRem: number;
};

type Props = {
  estado: EstadoDeDados;
  /** o que está carregando, para quem usa leitor de tela ("agendamentos de hoje") */
  rotulo: string;
  esqueleto: Esqueleto;
  vazio: Vazio;
  children: ReactNode;
};

// Botão com peso 500 e título do estado em Poppins (Guia de Design §2.1 e §6), faces que o layout carrega.
const botao = "min-h-11 rounded-md px-5 py-2.5 font-medium";
const botaoPrimario = `${botao} bg-brand text-on-brand hover:bg-(--button-primary-hover-bg)`;
const botaoSecundario = `${botao} border border-border-functional text-text-primary hover:bg-surface-card`;

export function DataState({ estado, rotulo, esqueleto, vazio, children }: Props) {
  switch (estado.tipo) {
    case "pronto":
      return children;

    case "carregando":
      return (
        <div data-estado="carregando" aria-busy="true" aria-label={rotulo} className="flex flex-col gap-2">
          <p role="status" className="sr-only">
            {textos.carregando}
          </p>
          {Array.from({ length: esqueleto.linhas }, (_, i) => (
            <div
              key={i}
              data-esqueleto=""
              aria-hidden="true"
              className="animate-pulse rounded-md bg-surface-card"
              style={{ height: `${esqueleto.alturaRem}rem` }}
            />
          ))}
        </div>
      );

    case "vazio":
      return (
        <Quadro estado="vazio" papel="status" rotulo={rotulo}>
          <p className="font-sub text-lg text-text-primary">{vazio.titulo}</p>
          {vazio.texto && <p className="text-text-secondary">{vazio.texto}</p>}
          {vazio.acao && (
            <button type="button" className={`mt-2 ${botaoPrimario}`} onClick={vazio.acao.aoClicar}>
              {vazio.acao.rotulo}
            </button>
          )}
        </Quadro>
      );

    case "sem-resultado":
      return (
        <Quadro estado="sem-resultado" papel="status" rotulo={rotulo}>
          <p className="font-sub text-lg text-text-primary">{textos.semResultado.titulo}</p>
          <p className="text-text-secondary">{textos.semResultado.texto}</p>
          <button type="button" className={`mt-2 ${botaoSecundario}`} onClick={estado.limparFiltros}>
            {textos.semResultado.acao}
          </button>
        </Quadro>
      );

    case "erro":
      // Nunca parecido com o vazio (planning/05 §4.5): papel alert, borda e ícone de status negativo, e a ação é
      // tentar de novo, não criar. Quem vê uma lista vazia por erro acha que perdeu os dados.
      return (
        <Quadro estado="erro" papel="alert" rotulo={rotulo} className="border-2 border-status-negative">
          <div className="flex items-center gap-3">
            <IconeAlerta />
            <p className="font-sub text-lg text-text-primary">{textos.erro.titulo}</p>
          </div>
          <p className="text-text-secondary">{textos.erro.texto}</p>
          {estado.codigo && (
            <p className="text-sm text-text-secondary">
              {textos.erro.codigo} <span className="text-text-primary">{estado.codigo}</span>
            </p>
          )}
          <button type="button" className={`mt-2 ${botaoPrimario}`} onClick={estado.tentarDeNovo}>
            {textos.erro.acao}
          </button>
        </Quadro>
      );
  }
}

function Quadro({
  estado,
  papel,
  rotulo,
  className = "border border-border",
  children,
}: {
  estado: "vazio" | "sem-resultado" | "erro";
  papel: "status" | "alert";
  rotulo: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-estado={estado}
      aria-label={rotulo}
      className={`rounded-md bg-surface-raised p-6 ${className}`}
    >
      {/* o papel fica num filho: na própria section, o alert anunciaria também o rótulo da região */}
      <div role={papel} className="flex flex-col items-start gap-2">
        {children}
      </div>
    </section>
  );
}

function IconeAlerta() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-6 shrink-0 text-status-negative"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 7v6M12 17h.01" />
    </svg>
  );
}
