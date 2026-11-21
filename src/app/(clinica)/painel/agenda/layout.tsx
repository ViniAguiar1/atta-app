import { Suspense } from "react";
import { GuardaDoModulo } from "@/features/casca/components/GuardaDoModulo";

// Agendamentos: a rota segue a permissão do módulo, como a aba (PDD v206 §10.4.3; S2 da QA no stage, 21/11).
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <GuardaDoModulo href="/painel/agenda" rotulo="Agendamentos">
        {children}
      </GuardaDoModulo>
    </Suspense>
  );
}
