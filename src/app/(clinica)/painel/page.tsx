import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { abasDoPapel } from "@/features/casca/abas";
import { sessaoDoPainel } from "@/features/casca/sessao";

// A recepção abre o painel direto no primeiro módulo pronto que o papel vê (PDD v206 §10.2.2: Agendamentos, sem dashboard
// intermediário). Pelo papel, e não pelo primeiro da lista: Configurações é só do ADMIN (§10.4.3), e mandar o Colaborador
// para lá daria volta para /painel. Sem módulo para o papel, o painel mostra só a barra.
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
  const [primeira] = abasDoPapel(sessao?.papel ?? null);
  if (primeira) redirect(primeira.href);
  return null;
}
