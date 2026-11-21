import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { DataState } from "@/components/ui/DataState";
import { Subabas } from "@/components/ui/Subabas";
import { sessaoDoPainel } from "@/features/casca/sessao";
import { CaixaDeNotificacoes, type ItemDaCaixa } from "@/features/notificacoes/components/CaixaDeNotificacoes";
import { ComoChegam } from "@/features/notificacoes/components/ComoChegam";
import { ErroDaCaixa } from "@/features/notificacoes/components/ErroDaCaixa";
import { grupoDoDia, rotuloDoQuando } from "@/features/notificacoes/formato";
import type { Notificacao } from "@/features/notificacoes/schema";
import { textos } from "@/features/notificacoes/textos";
import { portaNotificacoes } from "@/server/notificacoes/porta";

// O sino do painel (MIG-45; PDD v206 §21 e §10.4.6), como o Simulador ATTA-in (captura 41): a Caixa de notificações e,
// ao lado, como as notificações chegam. Visível para o Colaborador e para o Gestor (§21); o que cada perfil vê é a
// LAC-050, em aberto, e por isso os dois veem o mesmo. Vazia na produção até o MIG-15; simulada fora dela.
export const metadata: Metadata = { title: "Notificações · ATTA-in" };

const FUSO = "America/Sao_Paulo"; // padrão de platform.tenant.timezone, como na Agenda
const HREF: Record<NonNullable<Notificacao["destino"]>, string> = {
  agenda: "/painel/agenda",
  pacientes: "/painel/pacientes",
  documentos: "/painel/documentos",
  equipe: "/painel/configuracoes/equipe",
  configuracoes: "/painel/configuracoes",
};
const SO_ADMIN = new Set<Notificacao["destino"]>(["equipe", "configuracoes"]); // Configurações é só do ADMIN (§10.4.3)

export default function Pagina() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">{textos.titulo}</h1>
      <Subabas rotulo={textos.subabas.rotulo} itens={[{ rotulo: textos.subabas.caixa, href: "/painel/notificacoes" }]} ativa="/painel/notificacoes" />
      <Suspense fallback={<DataState estado={{ tipo: "carregando" }} rotulo={textos.lista} esqueleto={{ linhas: 3, alturaRem: 6 }} vazio={textos.vazio}>{null}</DataState>}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  await connection(); // por requisição: a caixa é da clínica da sessão, e o "há 12 h" é de agora
  const [r, sessao] = await Promise.all([portaNotificacoes.caixa(), sessaoDoPainel()]);
  if (!r.ok) return <ErroDaCaixa codigo={r.error.code} />;
  const admin = sessao?.papel === "ADMIN";
  const agora = new Date();
  const itens: ItemDaCaixa[] = r.data.itens.map((n) => ({
    id: n.id,
    tipo: n.tipo,
    evento: n.evento,
    titulo: n.titulo,
    corpo: n.corpo,
    lida: n.lida,
    grupo: grupoDoDia(n.em, agora, FUSO),
    quando: rotuloDoQuando(n.em, agora, FUSO),
    destino: n.destino && (admin || !SO_ADMIN.has(n.destino)) ? { rotulo: textos.destinos[n.destino], href: HREF[n.destino] } : null,
  }));
  return (
    <div className="grid grid-cols-1 items-start gap-4 large:grid-cols-[minmax(0,1fr)_20rem]">
      <CaixaDeNotificacoes itens={itens} />
      <ComoChegam canais={r.data.canais} admin={admin} />
    </div>
  );
}
