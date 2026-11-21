"use client";

import { useEffect, useRef, useState } from "react";
import { TEXTOS } from "../textos";

// Quadro da assinatura desenhada (PDD §10.4.3: "desenha a própria assinatura eletrônica na tela"; simulador, captura
// 26). Mouse, dedo ou caneta pelos pointer events; a imagem sai como PNG (data URL) só quando há traço. A tela não
// guarda a imagem: ela vai no corpo do envio, e o servidor a cifra (ATTA Sign, Backend 3).
type Props = { desabilitado: boolean; aoMudar: (png: string | null) => void };

export function QuadroDeAssinatura({ desabilitado, aoMudar }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const [temTraco, setTemTraco] = useState(false);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const escala = window.devicePixelRatio || 1;
    c.width = c.clientWidth * escala;
    c.height = c.clientHeight * escala;
    ctx.scale(escala, escala);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = getComputedStyle(c).color;
  }, []);

  const ponto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function comecar(e: React.PointerEvent<HTMLCanvasElement>) {
    if (desabilitado) return;
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    desenhando.current = true;
    const { x, y } = ponto(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current) return;
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = ponto(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function terminar() {
    if (!desenhando.current) return;
    desenhando.current = false;
    setTemTraco(true);
    aoMudar(canvas.current?.toDataURL("image/png") ?? null);
  }

  function limpar() {
    const c = canvas.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setTemTraco(false);
    aoMudar(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className={`relative rounded-md border border-dashed border-border-functional bg-surface-raised ${desabilitado ? "opacity-60" : ""}`}>
        <canvas
          ref={canvas}
          role="img"
          aria-label={TEXTOS.quadro}
          onPointerDown={comecar}
          onPointerMove={mover}
          onPointerUp={terminar}
          onPointerLeave={terminar}
          className="block h-36 w-full touch-none text-text-primary"
        />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-3 bottom-7 border-b border-border-functional" />
        <p aria-hidden="true" className="pointer-events-none absolute bottom-1.5 left-3 text-xs text-text-secondary">
          {TEXTOS.quadro}
        </p>
      </div>
      {temTraco && (
        <button type="button" onClick={limpar} className="min-h-11 self-start text-base font-medium underline">
          {TEXTOS.limpar}
        </button>
      )}
    </div>
  );
}
