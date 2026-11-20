import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { TelaDoSite } from "@/features/entrar/components/TelaDoSite";
import { ROTA_LOGIN } from "@/lib/auth/rotas";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FormularioNovaSenha } from "./FormularioNovaSenha";

export const metadata: Metadata = { title: "Criar nova senha · ATTA-in" };

// Nova senha de quem chegou pelo link do e-mail (MIG-03c). Só com a sessão que o /auth/confirm abriu.
export default function Pagina() {
  return (
    <TelaDoSite>
      <h1 className="font-title text-3xl leading-tight">Criar nova senha</h1>
      <div className="mt-5">
        <Suspense fallback={null}>
          <ComSessao />
        </Suspense>
      </div>
    </TelaDoSite>
  );
}

async function ComSessao() {
  await connection();
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect(`${ROTA_LOGIN}?erro=link`);
  return <FormularioNovaSenha />;
}
