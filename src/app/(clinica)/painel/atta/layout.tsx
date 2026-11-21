import type { Metadata } from "next";
import { Suspense } from "react";
import { GuardaDoModulo } from "@/features/casca/components/GuardaDoModulo";

// Título da aba do navegador para todas as subabas do ATTA (o mesmo que o #147 pôs no estado vazio do módulo). A rota
// segue a permissão do módulo (atta.view), como a aba (PDD v206 §10.4.3; S2 da QA no stage, 21/11).
export const metadata: Metadata = { title: "ATTA · ATTA-in" };

export default function LayoutDoAtta({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <GuardaDoModulo href="/painel/atta" rotulo="ATTA">
        {children}
      </GuardaDoModulo>
    </Suspense>
  );
}
