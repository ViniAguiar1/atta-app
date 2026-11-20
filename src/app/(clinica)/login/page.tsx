import type { Metadata } from "next";
import Link from "next/link";
import { TelaDoSite } from "@/features/entrar/components/TelaDoSite";
import { ROTA_ESQUECI } from "@/lib/auth/rotas";
import { FormularioDeEntrada } from "./FormularioDeEntrada";
import { textos as t } from "./textos";

// Tela de entrar do painel da clínica, como a página "Entrar" do artefato aprovado "Site ATTA-in" (pedido do dono, 20/11):
// fundo verde e cartão com o logo "ATTA-in", o formulário e "Esqueci a senha". Rota /login: PDD v206 §10.4.9 ("Acesse
// a plataforma" leva ao /login). Quem entra: ADMIN e COLABORADOR (§10.4.3); o profissional não tem login (§10.2.3).
// Pública; quem já tem sessão é levado ao painel pelo proxy.
export const metadata: Metadata = { title: "Entrar · ATTA-in" };

export default function Pagina() {
  return (
    <TelaDoSite>
      <p className="flex items-end leading-none">
        <span className="sr-only">ATTA-in</span>
        {/* a marca grande do artefato: fora da escala de texto (que para em 2.5rem), de propósito */}
        <span aria-hidden="true" className="font-atta text-[4.25rem] medium:text-[5.25rem]">
          ATTA
        </span>
        <span aria-hidden="true" className="font-product text-[2.75rem] medium:text-[3.25rem]">
          -in
        </span>
      </p>
      <h1 className="mt-5 font-title text-3xl leading-tight">
        {/* duas linhas, como no artefato; o espaço entre elas mantém o nome acessível "Entrar no painel da clínica" */}
        <span className="block">{t.titulo[0]}</span> <span className="block">{t.titulo[1]}</span>
      </h1>
      <p className="mt-3 text-lg text-text-secondary">{t.subtitulo}</p>
      <div className="mt-6">
        <FormularioDeEntrada />
      </div>
      <p className="mt-6">
        <Link href={ROTA_ESQUECI} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
          {t.esqueci}
        </Link>
      </p>
    </TelaDoSite>
  );
}
