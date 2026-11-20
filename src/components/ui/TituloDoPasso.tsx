"use client";

import { useEffect, useRef } from "react";

// Título de cada passo: recebe o foco ao aparecer, para o leitor de tela anunciar a troca de passo. Sem contorno:
// o foco é programático e o título não é interativo (o anel fica para o que se aciona).
export function TituloDoPasso({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <h1 ref={ref} tabIndex={-1} className="font-title text-3xl leading-tight text-text-primary focus:outline-none">
      {children}
    </h1>
  );
}
