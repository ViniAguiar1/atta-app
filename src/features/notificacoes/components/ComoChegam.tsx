import Link from "next/link";
import type { Canais } from "../schema";
import { textos } from "../textos";

// "Como as notificações chegam" (Simulador ATTA-in, captura 41; PDD v206 §10.4.6): o sino, sempre ativo e não
// configurável, e o estado dos canais externos e filtros, como estão em Configurações › Notificações. Sem configuração
// lida, "—". O atalho para Configurações vem pronto da página: só para o ADMIN (§10.4.3) e só quando a seção tem tela.
const c = textos.canais;

function Linha({ titulo, detalhe, estado }: { titulo: string; detalhe?: string | null; estado: string }) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-md border border-border bg-surface-raised p-3">
      <span className="flex min-w-0 flex-col">
        <span className="text-text-primary">{titulo}</span>
        {detalhe && <span className="break-words text-text-secondary">{detalhe}</span>}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface-card px-2 py-0.5 text-xs font-medium">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-text-secondary" />
        {estado}
      </span>
    </li>
  );
}

export function ComoChegam({ canais, configurar }: { canais: Canais; configurar: string | null }) {
  const sem = c.semConfiguracao;
  return (
    <aside aria-labelledby="como-chegam" className="flex flex-col gap-3 rounded-md border border-border bg-surface-app p-4 text-[0.8125rem]">
      <h2 id="como-chegam" className="text-[0.6875rem] font-semibold tracking-wide text-status-info uppercase">
        {c.titulo}
      </h2>
      <ul className="flex flex-col gap-2">
        <Linha titulo={c.sino} detalhe={c.sinoDetalhe} estado={c.sempreAtivo} />
        <Linha titulo={c.email} detalhe={canais.email?.endereco} estado={canais.email ? (canais.email.ativo ? c.ativo : c.desativado) : sem} />
        <Linha titulo={c.whatsapp} estado={canais.whatsapp ? (canais.whatsapp.ativo ? c.ativo : c.desativado) : sem} />
        <Linha titulo={c.pausa} detalhe={c.pausaDetalhe} estado={canais.pausaNoturna ? (canais.pausaNoturna.ativa ? c.ativa : c.desativada) : sem} />
        <Linha titulo={c.resumo} estado={canais.resumo ? c.resumos[canais.resumo] : sem} />
      </ul>
      <p className="text-text-secondary">
        {canais.eventos ? c.eventos(canais.eventos.comEmail, canais.eventos.total, canais.eventos.comWhatsapp) : c.sinoRecebeTodos}
      </p>
      {configurar && (
        <Link href={configurar} className="inline-flex min-h-11 w-fit items-center font-semibold underline underline-offset-2 medium:min-h-0">
          {c.configurar}
        </Link>
      )}
      <div className="flex gap-2 rounded-md border border-border border-l-3 border-l-status-info bg-(--faixa-info-bg) p-3">
        <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-status-info" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" focusable="false">
          <rect x="5" y="10.5" width="14" height="10" rx="2" />
          <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
        </svg>
        <p>
          <strong className="font-semibold">{textos.privacidade.destaque}</strong> {textos.privacidade.texto}
        </p>
      </div>
    </aside>
  );
}
