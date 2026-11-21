import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { violacoesDoAxe } from "@/components/ui/axe-de-teste";
import { CANAIS_VAZIOS, type Canais } from "../schema";
import { ComoChegam } from "./ComoChegam";

const CANAIS: Canais = {
  email: { ativo: true, endereco: "recepcao@clinica.exemplo" },
  whatsapp: { ativo: false },
  pausaNoturna: { ativa: true },
  resumo: "tempo_real",
  eventos: { total: 36, comEmail: 4, comWhatsapp: 0 },
};

describe("Como as notificações chegam (MIG-45)", () => {
  it("o sino sempre ativo, o estado de cada canal e a privacidade sem código de regra", async () => {
    const { container } = render(<ComoChegam canais={CANAIS} admin />);
    expect(screen.getByText("Sempre ativo")).toBeInTheDocument();
    expect(screen.getByText("recepcao@clinica.exemplo")).toBeInTheDocument();
    expect(screen.getByText("Desativado")).toBeInTheDocument();
    expect(screen.getByText("Tempo real")).toBeInTheDocument();
    expect(screen.getByText("4 de 36 eventos com e-mail · 0 com WhatsApp. O sino recebe todos.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Configurar em Configurações › Notificações" })).toHaveAttribute("href", "/painel/configuracoes/notificacoes");
    expect(container.textContent).toContain("Nenhuma notificação contém dado de saúde.");
    expect(container.textContent).not.toMatch(/RN-|CA-E/);
    expect(await violacoesDoAxe(container)).toEqual([]);
  });

  it("sem configuração lida, '—' nos canais; o Colaborador não recebe o atalho para Configurações", () => {
    render(<ComoChegam canais={CANAIS_VAZIOS} admin={false} />);
    expect(screen.getAllByText("—")).toHaveLength(4);
    expect(screen.getByText("Sempre ativo")).toBeInTheDocument();
    expect(screen.getByText("O sino recebe todos os eventos.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
