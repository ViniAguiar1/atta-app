import { useId } from "react";

// Cartão de seção (Simulador ATTA-in, capturas 19 a 23 e 02): cabeçalho em surface-app com o ícone numa caixa branca,
// título e subtítulo, e a ação opcional à direita; corpo branco. Dono: Frontend 5; usam ATTA, Configurações e a Pasta
// do Paciente (ORDEM do Tech Lead Frontend, componentes comuns). O ícone é decorativo: cada tela passa o seu (SVG de
// traço fino, Guia de Design §7, ou o emoji do simulador).
type Props = {
  titulo: string;
  subtitulo?: string;
  icone: React.ReactNode;
  /** à direita do cabeçalho, ex.: "Rodar diagnóstico" ou os botões de ordenação */
  acao?: React.ReactNode;
  /** nível do título; padrão 2 */
  nivel?: 2 | 3;
  /** parágrafo secundário no topo do corpo */
  texto?: string;
  /** corpo sem padding, para tabela ou lista que encosta na borda */
  semPreenchimento?: boolean;
  /** escala menor dos modais (título ~13 px, subtítulo ~11 px), como o Novo paciente das capturas 15 a 18 */
  compacto?: boolean;
  children?: React.ReactNode;
};

export function CartaoDeSecao({ titulo, subtitulo, icone, acao, nivel = 2, texto, semPreenchimento = false, compacto = false, children }: Props) {
  const id = useId();
  const Titulo = nivel === 2 ? "h2" : "h3";
  const temCorpo = Boolean(texto || children);
  return (
    <section aria-labelledby={id} className="overflow-hidden rounded-md border border-border bg-surface-raised">
      <header
        className={`flex items-center bg-surface-app ${compacto ? "gap-3 px-3.5 py-2.5" : "gap-3.5 px-4 py-3.5"} ${temCorpo ? "border-b border-border" : ""}`}
      >
        <span
          aria-hidden="true"
          className={`flex shrink-0 items-center justify-center rounded-sm border border-border bg-surface-raised leading-none ${compacto ? "size-7 text-sm" : "size-8 text-base"}`}
        >
          {icone}
        </span>
        <div className="min-w-0 flex-1">
          {/* 15 e 13 px, como no simulador (a escala do Guia não tem esses passos; rem para respeitar o zoom) */}
          <Titulo id={id} className={`font-semibold leading-snug ${compacto ? "text-[0.8125rem]" : "text-[0.9375rem]"}`}>
            {titulo}
          </Titulo>
          {subtitulo && <p className={`text-text-secondary ${compacto ? "text-[0.6875rem]" : "text-[0.8125rem]"}`}>{subtitulo}</p>}
        </div>
        {acao && <div className="shrink-0">{acao}</div>}
      </header>
      {temCorpo && (
        <div className={semPreenchimento ? "" : compacto ? "flex flex-col gap-3 p-3.5" : "flex flex-col gap-4 p-4"}>
          {texto && <p className="text-text-secondary">{texto}</p>}
          {children}
        </div>
      )}
    </section>
  );
}
