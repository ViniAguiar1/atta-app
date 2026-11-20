import { sair } from "../login/actions";

// Sessão válida, mas sem vínculo ativo com nenhuma clínica (o hook não pôs tenant_id no token).
export default function SemClinica() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="font-title text-3xl text-text-primary">Sem clínica vinculada</h1>
      <p className="text-text-secondary">
        Sua conta não está ligada a nenhuma clínica ativa. Peça ao gestor da clínica um novo convite.
      </p>
      <form action={sair}>
        <button type="submit" className="min-h-11 rounded-md border border-border-functional px-5 text-text-primary">
          Sair
        </button>
      </form>
    </main>
  );
}
