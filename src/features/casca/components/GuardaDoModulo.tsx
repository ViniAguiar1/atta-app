import { connection } from "next/server";
import { SemAcesso } from "@/components/ui/DataState";
import { podeAbrirAba } from "../abas";
import { sessaoDoPainel } from "../sessao";

// Guarda de rota de um módulo do painel (PDD v206 §10.4.3: o acesso do Colaborador é módulo a módulo): a mesma regra que
// mostra a aba (podeAbrirAba). Sem a permissão, a tela mostra o "sem acesso", sem código técnico e sem 404 (S2 da QA no
// stage, 21/11). Quem autoriza de fato é a RLS e o has_permission do banco: a guarda só não chama a leitura à toa.
export async function GuardaDoModulo({ href, rotulo, children }: { href: string; rotulo: string; children: React.ReactNode }) {
  await connection();
  const sessao = await sessaoDoPainel();
  if (!podeAbrirAba(href, sessao?.papel ?? null, sessao?.permissoes ?? [])) {
    return (
      <>
        <h1 className="sr-only">{rotulo}</h1>
        <SemAcesso rotulo={rotulo} />
      </>
    );
  }
  return children;
}
