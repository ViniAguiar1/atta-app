import type { Metadata } from "next";
import { PaginaDeVerificacao } from "@/features/verificacao/components/PaginaDeVerificacao";

// Verificação pública do Código ATTA (MIG-54; PDD v206 §18.6): a entrada, sem login. Na produção, verify.attahub.com.br
// (separação por host no MIG-09).
export const metadata: Metadata = { title: "Verificação pública · ATTA" };

export default function Pagina() {
  return <PaginaDeVerificacao />;
}
