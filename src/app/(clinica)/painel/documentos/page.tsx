import type { Metadata } from "next";
import { ModuloVazio } from "@/features/casca/components/ModuloVazio";
import { textos } from "@/features/casca/textos";

// Termos & Docs: a aba aparece sempre (decisão do dono, 20/11). Até a tela do módulo (MIG-44, Frontend 6), o estado vazio do design.
export const metadata: Metadata = { title: "Termos & Docs · ATTA-in" };

const t = textos.vazios.documentos;

export default function Pagina() {
  return <ModuloVazio titulo={t.titulo} vazio={t.vazio} />;
}
