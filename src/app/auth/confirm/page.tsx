import type { Metadata } from "next";
import { Suspense } from "react";
import { confirmarLink } from "./actions";
import { linkValido } from "./link";

export const metadata: Metadata = { title: "Confirmar acesso · ATTA-in" };

type Busca = Promise<{ token_hash?: string; type?: string }>;

// Link do e-mail de "Esqueci a senha" e do convite (MIG-03c/03d). Abrir a página (GET) não confere nada: filtros de
// e-mail corporativo abrem links sozinhos e gastariam o token (Segurança, #63). Quem confere é o botão (POST, server
// action), com o verifyOtp no servidor. Texto provisório: o PDD e o simulador não têm esta tela.
export default function Pagina({ searchParams }: { searchParams: Busca }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-md border border-border bg-surface-raised px-6 py-7">
        <h1 className="font-title text-3xl leading-tight">Confirmar acesso</h1>
        <Suspense fallback={null}>
          <Formulario searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Formulario({ searchParams }: { searchParams: Busca }) {
  const { token_hash, type } = await searchParams;
  if (!linkValido(token_hash, type)) {
    return <p className="mt-4 text-text-secondary">Este link não é válido. Peça um novo na tela de entrar.</p>;
  }
  return (
    <form action={confirmarLink} className="mt-5 flex flex-col gap-4">
      <p className="text-text-secondary">Toque em continuar para criar a sua senha.</p>
      <input type="hidden" name="token_hash" value={token_hash} />
      <input type="hidden" name="type" value={type} />
      <button type="submit" className="min-h-12 w-full rounded-md bg-brand px-5 font-medium text-on-brand">
        Continuar
      </button>
    </form>
  );
}
