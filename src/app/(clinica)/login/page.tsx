import type { Metadata } from "next";
import { Monograma } from "@/components/ui/Monograma";
import { FormularioDeEntrada } from "./FormularioDeEntrada";
import { textos as t } from "./textos";

// Tela de entrar do painel da clínica, como no Simulador ATTA-in (captura 07). Rota /login: PDD v206 §10.4.9 ("Acesse a
// plataforma" leva ao /login). Quem entra: ADMIN e COLABORADOR (§10.4.3); o profissional não tem login (§10.2.3).
// Pública; quem já tem sessão é levado ao painel pelo proxy. "Esqueci a senha" entra com as ações do MIG-03c.
export const metadata: Metadata = { title: "Entrar · ATTA-in" };

export default function Pagina() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-md border border-border bg-surface-raised px-6 py-7 medium:px-7">
        <p className="flex items-end gap-1 text-3xl text-brand">
          <Monograma className="size-9" />
          <span className="font-atta">ATTA</span>
          <span className="font-product text-xl">-in</span>
        </p>
        <h1 className="mt-3 font-title text-3xl leading-tight">{t.titulo}</h1>
        <p className="mt-3 text-text-secondary">{t.subtitulo}</p>
        <div className="mt-5">
          <FormularioDeEntrada />
        </div>
      </div>
    </main>
  );
}
