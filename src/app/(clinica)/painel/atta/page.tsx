import type { Metadata } from "next";
import { ModuloVazio } from "@/features/casca/components/ModuloVazio";
import { textos } from "@/features/casca/textos";

// ATTA: a aba aparece sempre (decisão do dono, 20/11). Até a tela do módulo (MIG-48, Frontend 5), o estado vazio do design.
export const metadata: Metadata = { title: "ATTA · ATTA-in" };

const t = textos.vazios.atta;

export default function Pagina() {
  return <ModuloVazio titulo={t.titulo} vazio={t.vazio} />;
}
