"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ModeloDeDocumento } from "@/server/documentos/porta";
import { inativarModelo, publicarModelo } from "../actions";
import { textos } from "../textos";
import { DialogoInativar } from "./DialogoInativar";
import { DialogoVincular } from "./DialogoVincular";

// Menu ⋮ de cada modelo (simulador, captura 39). Mostra só as ações que o servidor devolveu em allowed_actions (ADR
// 0001 §5), na ordem dele; "publicar" desabilitado mostra o motivo. "editar" fica fora até existir o editor (botão sem
// destino fica fora). Esc fecha e devolve o foco ao botão; o resultado aparece numa linha com role=status.
type Props = { modelo: ModeloDeDocumento };
type Dialogo = "inativar" | "vincular" | null;

const COM_DESTINO = ["publicar", "vincular_procedimentos", "inativar"] as const;
type AcaoComDestino = (typeof COM_DESTINO)[number];
const temDestino = (a: { acao: string }): a is { acao: AcaoComDestino; motivoDesabilitado: string | null } =>
  (COM_DESTINO as readonly string[]).includes(a.acao);

export function MenuDoModelo({ modelo }: Props) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, executar] = useTransition();
  const botao = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const acoes = modelo.acoes.filter(temDestino);

  useEffect(() => {
    if (aberto) lista.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
  }, [aberto]);

  if (acoes.length === 0) return null;

  function fechar() {
    setAberto(false);
    botao.current?.focus();
  }

  function publicar() {
    setAberto(false);
    executar(async () => {
      const r = await publicarModelo(modelo.id);
      if (r.ok) {
        setAviso(textos.publicado(r.data.versao));
        return router.refresh();
      }
      const campo = r.error.fields?.[0]?.campo;
      setAviso(
        (campo && textos.errosDePublicar[campo]) ||
          (r.error.reason === "ATTA-IN-0002:draft_body" ? textos.semMudanca : textos.falhou),
      );
    });
  }

  async function inativar(): Promise<string | null> {
    const r = await inativarModelo(modelo.id);
    if (!r.ok) return textos.falhou;
    setDialogo(null);
    router.refresh();
    return null;
  }

  return (
    <div className="relative flex flex-col items-end gap-1" onKeyDown={(e) => e.key === "Escape" && aberto && fechar()}>
      <button
        ref={botao}
        type="button"
        aria-label={textos.menu(modelo.titulo)}
        aria-haspopup="true"
        aria-expanded={aberto}
        disabled={ocupado}
        onClick={() => setAberto((a) => !a)}
        className="grid size-9 place-items-center rounded-md border border-border-functional bg-surface-raised text-text-primary"
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
      {aberto && (
        <ul ref={lista} className="absolute top-10 right-0 z-10 flex min-w-56 flex-col rounded-md border border-border bg-surface-raised py-1 shadow-md">
          {acoes.map((a) => {
            const motivo = a.motivoDesabilitado ? (textos.motivos[a.motivoDesabilitado] ?? textos.falhou) : null;
            const aoClicar = a.acao === "publicar" ? publicar : () => (setAberto(false), setDialogo(a.acao === "inativar" ? "inativar" : "vincular"));
            return (
              <li key={a.acao}>
                <button
                  type="button"
                  disabled={Boolean(motivo)}
                  aria-describedby={motivo ? `${modelo.id}-${a.acao}-motivo` : undefined}
                  onClick={aoClicar}
                  className="flex w-full flex-col items-start px-4 py-2 text-left text-[0.8125rem] text-text-primary hover:bg-surface-card disabled:text-text-secondary disabled:hover:bg-transparent"
                >
                  {textos.acoes[a.acao]}
                  {motivo && (
                    <span id={`${modelo.id}-${a.acao}-motivo`} className="text-xs text-text-secondary">
                      {motivo}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p role="status" className="max-w-48 text-right text-xs text-text-secondary">
        {aviso}
      </p>
      {dialogo === "inativar" && <DialogoInativar titulo={modelo.titulo} aoConfirmar={inativar} aoFechar={() => setDialogo(null)} />}
      {dialogo === "vincular" && (
        <DialogoVincular
          modelo={modelo}
          aoFechar={() => setDialogo(null)}
          aoSalvar={() => {
            setDialogo(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
