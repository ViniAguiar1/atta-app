import { notFound } from "next/navigation";
import { ABAS } from "@/features/casca/abas";
import { textos } from "@/features/casca/textos";

// Módulos da casca que ainda não têm tela: cada um ganha rota própria no seu item (MIG-41 a MIG-48), que vence esta.
// A lista é fixa: gerada no build (cacheComponents); caminho fora dela é 404.
const MODULOS = [...ABAS.map((aba) => ({ rotulo: aba.rotulo, slug: aba.href.split("/")[2] ?? "" })), { rotulo: "Notificações", slug: "notificacoes" }];

export function generateStaticParams() {
  return MODULOS.map(({ slug }) => ({ modulo: slug }));
}

export default async function Page({ params }: { params: Promise<{ modulo: string }> }) {
  const { modulo } = await params;
  const encontrado = MODULOS.find((m) => m.slug === modulo);
  if (!encontrado) notFound();
  return (
    <section aria-labelledby="titulo-do-modulo">
      {/* PDD §10: a tela do módulo não repete o nome da aba ativa; o h1 fica só para o leitor de tela */}
      <h1 id="titulo-do-modulo" className="sr-only">
        {encontrado.rotulo}
      </h1>
      <p className="text-text-secondary">{textos.emConstrucao}</p>
    </section>
  );
}
