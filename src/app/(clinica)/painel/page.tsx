import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { SemAcesso } from "@/components/ui/DataState";
import { abasDoPapel } from "@/features/casca/abas";
import { sessaoDoPainel } from "@/features/casca/sessao";

// A recepção abre o painel direto no primeiro módulo pronto que o papel vê (PDD v206 §10.2.2: Agendamentos, sem dashboard
// intermediário). Pelo papel, e não pelo primeiro da lista: Configurações é só do ADMIN (§10.4.3), e mandar o Colaborador
// para lá daria volta para /painel. Sem nenhum módulo liberado, o "sem acesso" (PDD §10.4.3; S2 da QA, 21/11).
export default function Page() {
  return (
    <Suspense fallback={null}>
      <Destino />
    </Suspense>
  );
}

async function Destino() {
  await connection();
  const sessao = await sessaoDoPainel();
  const [primeira] = abasDoPapel(sessao?.papel ?? null, sessao?.permissoes ?? []);
  if (primeira) redirect(primeira.href);
  return (
    <>
      <h1 className="sr-only">Painel</h1>
      <SemAcesso rotulo="Painel" />
    </>
  );
}
