import type { ButtonHTMLAttributes } from "react";

// Botão comum (proposta do Frontend 2; dono da pasta: Frontend). Alvo de toque ≥ 48 px, largura total no celular.
type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variante?: "primario" | "secundario" };

const VARIANTES = {
  primario: "bg-brand text-on-brand",
  secundario: "border border-border-functional bg-surface-raised text-text-primary",
};

export function Botao({ variante = "primario", className = "", type = "button", ...props }: Props) {
  return (
    <button
      type={type}
      className={`min-h-12 w-full rounded-md px-5 text-lg font-medium disabled:opacity-60 ${VARIANTES[variante]} ${className}`}
      {...props}
    />
  );
}
