import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { abasDoPapel, moduloDisponivel } from "@/features/casca/abas";
import { sessaoDoPainel } from "@/features/casca/sessao";

// A recepção abre o painel direto no primeiro módulo pronto que o papel vê (PDD v206 §10.2.2: Agendamentos, sem dashboard
// intermediário). Pelo papel, e não pelo primeiro da lista: Configurações é só do ADMIN (§10.4.3), e mandar o Colaborador
// para lá daria volta para /painel. Sem módulo para o papel, o painel mostra só a barra.
// Transição: a Agenda ainda responde 404 na produção até a porta vazia dela (#142, Frontend 4); até lá o /painel pula
// para a aba seguinte. Quando a guarda sair da página da Agenda, sai daqui também.
const AINDA_COM_GUARDA = ["/painel/agenda"];
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
  const [primeira] = abasDoPapel(sessao?.papel ?? null).filter((a) => !AINDA_COM_GUARDA.includes(a.href) || moduloDisponivel(a.href));
  if (primeira) redirect(primeira.href);
  return null;
}
