import Link from "next/link";

// Subabas de um módulo (Simulador ATTA-in: "Pacientes · Pasta do Paciente", captura 09; as subabas do ATTA, capturas
// 19 a 23). Dono: Frontend 3 (componente comum, ORDEM do Tech Lead Frontend). Links simples, sem estado: a página diz
// qual está ativa. A ativa tem o sublinhado de 2 px no verde da marca, texto primário em 600 e aria-current="page".
// Com muitas subabas no celular (as 5 do ATTA em 390 px), quem rola de lado é a lista, nunca a página.

export type Subaba = { rotulo: string; href: string };

type Props = {
  /** Nome da navegação para o leitor de tela, ex. "Seções de Pacientes". */
  rotulo: string;
  itens: readonly Subaba[];
  /** href da subaba ativa. */
  ativa: string;
};

export function Subabas({ rotulo, itens, ativa }: Props) {
  return (
    <nav aria-label={rotulo} className="border-b border-border">
      <ul className="flex gap-2 overflow-x-auto pb-px">
        {itens.map((item) => {
          const atual = item.href === ativa;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={atual ? "page" : undefined}
                className={`-mb-px flex min-h-11 items-center border-b-2 px-4 text-sm whitespace-nowrap ${
                  atual ? "border-brand font-semibold text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
                }`}
              >
                {item.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
