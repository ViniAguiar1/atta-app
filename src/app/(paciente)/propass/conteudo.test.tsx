import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ lerHashDoConvite: vi.fn(), resolver: vi.fn() }));
vi.mock("@/server/propass/cookies", () => ({ lerHashDoConvite: m.lerHashDoConvite }));
vi.mock("@/server/propass/porta", () => ({ portaPropass: { resolver: m.resolver } }));
vi.mock("@/features/propass/components/FluxoPropass", async (original) => ({
  ...(await original<typeof import("@/features/propass/components/FluxoPropass")>()),
  FluxoPropass: ({ clinica }: { clinica: string }) => <p>fluxo de {clinica}</p>,
}));

import { Conteudo } from "./conteudo";

const HASH = Buffer.alloc(32, 9);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/propass: o que aparece para cada resposta do servidor", () => {
  it("sem cookie ou com o link recusado (NAO_ENCONTRADO): convite que não vale, sem formulário", async () => {
    m.lerHashDoConvite.mockResolvedValue(null);
    render(await Conteudo());
    expect(screen.getByRole("heading", { name: "Este convite não vale mais." })).toBeInTheDocument();
    expect(m.resolver).not.toHaveBeenCalled();
    cleanup();
    m.lerHashDoConvite.mockResolvedValue(HASH);
    m.resolver.mockResolvedValue({ ok: false, error: { code: "NAO_ENCONTRADO", message: "Não encontrado." } });
    render(await Conteudo());
    expect(screen.getByRole("heading", { name: "Este convite não vale mais." })).toBeInTheDocument();
  });

  it("falha do servidor (INTERNO ou INDISPONIVEL): aviso genérico, sem código e sem 'convite não vale'", async () => {
    m.lerHashDoConvite.mockResolvedValue(HASH);
    for (const code of ["INTERNO", "INDISPONIVEL"]) {
      m.resolver.mockResolvedValue({ ok: false, error: { code, message: "Algo deu errado. Tente de novo." } });
      const { container } = render(await Conteudo());
      expect(screen.getByRole("heading", { name: "Não conseguimos continuar agora. Tente de novo em instantes." })).toBeInTheDocument();
      expect(screen.queryByText("Este convite não vale mais.")).toBeNull();
      expect(container.textContent).not.toContain(code);
      cleanup();
    }
  });

  it("convite válido: abre o fluxo com a clínica do servidor", async () => {
    m.lerHashDoConvite.mockResolvedValue(HASH);
    m.resolver.mockResolvedValue({ ok: true, data: { clinica: "Clínica Alfa", emailDoConvite: "x@exemplo.test", conviteEm: "2026-11-21T10:00:00Z", fuso: "America/Manaus" } });
    render(await Conteudo());
    expect(screen.getByText("fluxo de Clínica Alfa")).toBeInTheDocument();
  });
});
