"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import type { ModeloDeDocumento } from "@/server/documentos/porta";
import { inativarModelo, publicarModelo } from "../actions";
import { textos } from "../textos";
import { DialogoInativar } from "./DialogoInativar";
import { DialogoVincular } from "./DialogoVincular";

// Menu ⋮ de cada modelo, no desenho do ⋮ da Agenda (simulador, captura 32): cartão branco que abre para cima, alinhado
// à direita; a ação destrutiva (Inativar) por último, separada e na cor de alerta. Mostra só as ações que o servidor
// devolveu em allowed_actions (ADR 0001 §5); "editar" fica fora até existir o editor. A lista fica fixa na janela,
// medida a partir do ⋮: a tabela rola de lado e cortaria um menu absoluto; abre para cima quando cabe, senão para baixo. É um botão que abre e fecha uma
// lista de botões (aria-expanded + aria-controls, como o menu da pessoa do #34), não um menu ARIA. "Publicar" sem
// condição fica com aria-disabled: continua no Tab e o motivo é lido. Esc, clique fora ou Tab para fora fecham; ao
// fechar um diálogo, o foco volta ao ⋮.
type Props = { modelo: ModeloDeDocumento };
type Dialogo = "inativar" | "vincular" | null;

const COM_DESTINO = ["publicar", "vincular_procedimentos", "inativar"] as const;
type AcaoComDestino = (typeof COM_DESTINO)[number];
const temDestino = (a: { acao: string }): a is { acao: AcaoComDestino; motivoDesabilitado: string | null } =>
  (COM_DESTINO as readonly string[]).includes(a.acao);

const item = "flex w-full flex-col items-start px-4 py-2 text-left text-sm hover:bg-surface-card";
const ALTURA_MAXIMA = 220; // as 3 ações com o motivo: abaixo disso, o menu abre para baixo

export function MenuDoModelo({ modelo }: Props) {
  const router = useRouter();
  const idDaLista = useId();
  const [aberto, setAberto] = useState(false);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [posicao, setPosicao] = useState<React.CSSProperties>({});
  const [ocupado, executar] = useTransition();
  const caixa = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const acoes = modelo.acoes.filter(temDestino);

  useEffect(() => {
    if (aberto) lista.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    const fechar = () => setAberto(false); // a posição é da janela: rolar ou redimensionar fecha
    document.addEventListener("pointerdown", fora);
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    return () => {
      document.removeEventListener("pointerdown", fora);
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
    };
  }, [aberto]);

  function alternar() {
    if (aberto) return setAberto(false);
    const r = botao.current?.getBoundingClientRect();
    if (r) {
      const direita = window.innerWidth - r.right;
      setPosicao(r.top > ALTURA_MAXIMA ? { right: direita, bottom: window.innerHeight - r.top + 4 } : { right: direita, top: r.bottom + 4 });
    }
    setAberto(true);
  }

  if (acoes.length === 0) return null;

  const voltarAoBotao = () => botao.current?.focus();

  function fechar() {
    setAberto(false);
    voltarAoBotao();
  }

  function fecharDialogo() {
    setDialogo(null);
    requestAnimationFrame(voltarAoBotao); // o item do menu que abriu o diálogo já sumiu
  }

  function publicar() {
    setAberto(false);
    voltarAoBotao();
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
    fecharDialogo();
    router.refresh();
    return null;
  }

  const comuns = acoes.filter((a) => a.acao !== "inativar");
  const destrutiva = acoes.find((a) => a.acao === "inativar");

  return (
    <div
      ref={caixa}
      className="relative flex flex-col items-end gap-1"
      onKeyDown={(e) => e.key === "Escape" && aberto && fechar()}
      onBlur={(e) => aberto && !caixa.current?.contains(e.relatedTarget as Node | null) && !dialogo && setAberto(false)}
    >
      <button
        ref={botao}
        type="button"
        aria-label={textos.menu(modelo.titulo)}
        aria-expanded={aberto}
        aria-controls={idDaLista}
        disabled={ocupado}
        onClick={alternar}
        className="grid size-8 place-items-center rounded-md border border-border-functional bg-surface-raised text-text-primary"
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
      <ul
        id={idDaLista}
        ref={lista}
        hidden={!aberto}
        style={posicao}
        className="fixed z-20 flex min-w-60 flex-col rounded-xl border border-border bg-surface-raised py-2 shadow-lg"
      >
        {comuns.map((a) => {
          const motivo = a.motivoDesabilitado ? (textos.motivos[a.motivoDesabilitado] ?? textos.falhou) : null;
          const idDoMotivo = `${idDaLista}-${a.acao}`;
          const aoClicar = a.acao === "publicar" ? publicar : () => (setAberto(false), setDialogo("vincular"));
          return (
            <li key={a.acao}>
              <button
                type="button"
                aria-disabled={motivo ? true : undefined}
                aria-describedby={motivo ? idDoMotivo : undefined}
                onClick={motivo ? undefined : aoClicar}
                className={`${item} ${motivo ? "cursor-not-allowed text-text-secondary hover:bg-transparent" : "text-text-primary"}`}
              >
                {textos.acoes[a.acao]}
                {motivo && (
                  <span id={idDoMotivo} className="text-xs text-text-secondary">
                    {motivo}
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {destrutiva && (
          <li className="mt-1 border-t border-border pt-1">
            <button type="button" onClick={() => (setAberto(false), setDialogo("inativar"))} className={`${item} text-status-negative`}>
              {textos.acoes.inativar}
            </button>
          </li>
        )}
      </ul>
      <p role="status" className="max-w-48 text-right text-xs text-text-secondary">
        {aviso}
      </p>
      {dialogo === "inativar" && <DialogoInativar titulo={modelo.titulo} aoConfirmar={inativar} aoFechar={fecharDialogo} />}
      {dialogo === "vincular" && (
        <DialogoVincular
          modelo={modelo}
          aoFechar={fecharDialogo}
          aoSalvar={() => {
            fecharDialogo();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
