import type { Metadata } from "next";

// Título da aba do navegador para todas as subabas do ATTA (o mesmo que o #147 pôs no estado vazio do módulo).
export const metadata: Metadata = { title: "ATTA · ATTA-in" };

export default function LayoutDoAtta({ children }: { children: React.ReactNode }) {
  return children;
}
