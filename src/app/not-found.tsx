import Link from "next/link";

// Página de "não encontrada" de todo o app, em português e com os tokens. Com streaming (cacheComponents), o Next 16
// mantém o status 200 quando o notFound() vem depois de a resposta começar, e injeta robots noindex (doc not-found.md).
export default function NaoEncontrada() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 p-8">
      <h1 className="font-title text-3xl text-text-primary">Página não encontrada</h1>
      <p className="text-text-secondary">Confira o endereço digitado.</p>
      <Link href="/" className="text-text-primary underline underline-offset-2">
        Voltar ao início
      </Link>
    </main>
  );
}
