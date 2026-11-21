import { Suspense } from "react";
import { GuardaDeMetricas } from "./guarda";

// Métricas (MIG-46): a guarda das três subabas (ADMIN, ou Colaborador com metrics.view; PDD v206 §10.4.3) fica em
// guarda.tsx, testada lá; o layout só a põe num Suspense, como as outras rotas com sessão (cacheComponents).
export default function LayoutDeMetricas({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <GuardaDeMetricas>{children}</GuardaDeMetricas>
    </Suspense>
  );
}
