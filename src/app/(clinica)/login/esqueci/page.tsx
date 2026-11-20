import type { Metadata } from "next";
import Link from "next/link";
import { TelaDoSite } from "@/features/entrar/components/TelaDoSite";
import { ROTA_LOGIN } from "@/lib/auth/rotas";
import { FormularioEsqueci } from "./FormularioEsqueci";

export const metadata: Metadata = { title: "Esqueci a senha · ATTA-in" };

// "Esqueci a senha" (MIG-03c; textos do simulador). Pública.
export default function Pagina() {
  return (
    <TelaDoSite>
      <p className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Recuperar acesso</p>
      <h1 className="mt-2 font-title text-3xl leading-tight">Esqueci a senha</h1>
      <div className="mt-5">
        <FormularioEsqueci />
      </div>
      <p className="mt-5">
        <Link href={ROTA_LOGIN} className="underline underline-offset-2">
          Voltar ao login
        </Link>
      </p>
    </TelaDoSite>
  );
}
