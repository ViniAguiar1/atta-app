import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { violacoesDoAxe } from "@/components/ui/axe-de-teste";
import { CaixaDeNotificacoes, type ItemDaCaixa } from "./CaixaDeNotificacoes";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const ITENS: ItemDaCaixa[] = [
  { id: "1", tipo: "agenda", evento: "Atendimento sem documento vinculado", titulo: "Atendimento sem documento vinculado", corpo: "Eduardo Lima, 16:30, está sem termo vinculado.", lida: false, grupo: "hoje", quando: "há 12 h", destino: { rotulo: "Ir para Agendamentos", href: "/painel/agenda" } },
  { id: "2", tipo: "equipe", evento: "Novo membro de equipe convidado", titulo: "Convite pendente", corpo: "Tiago Nunes ainda não aceitou o convite.", lida: false, grupo: "hoje", quando: "há 13 h", destino: null },
  { id: "3", tipo: "documento", evento: "Documento prestes a vencer", titulo: "Documento prestes a vencer", corpo: "Autorização de uso de imagem vence em 12 dias.", lida: true, grupo: "ontem", quando: "ontem às 18:20", destino: { rotulo: "Ir para Termos & Docs", href: "/painel/documentos" } },
];

describe("Caixa de notificações (MIG-45)", () => {
  it("agrupa em Hoje e Ontem com a contagem, marca as não lidas e leva ao módulo", async () => {
    const { container } = render(<CaixaDeNotificacoes itens={ITENS} />);
    const hoje = screen.getByRole("region", { name: "Hoje 2" });
    expect(within(hoje).getAllByRole("listitem")).toHaveLength(2);
    expect(within(hoje).getAllByText("Não lida")).toHaveLength(2);
    const ontem = screen.getByRole("region", { name: "Ontem 1" });
    expect(within(ontem).queryByText("Não lida")).toBeNull();
    expect(within(ontem).getByText("ontem às 18:20")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir para Agendamentos" })).toHaveAttribute("href", "/painel/agenda");
    expect(await violacoesDoAxe(container)).toEqual([]);
  });

  it("a busca filtra no título e no corpo, sem acento, e sem resultado oferece limpar", async () => {
    render(<CaixaDeNotificacoes itens={ITENS} />);
    const busca = screen.getByRole("searchbox", { name: "Buscar notificações" });
    await userEvent.type(busca, "autorizacao");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByRole("region", { name: /Hoje/ })).toBeNull();
    await userEvent.clear(busca);
    await userEvent.type(busca, "xyz");
    await userEvent.click(screen.getByRole("button", { name: /limpar/i }));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("sem notificação (produção até o MIG-15): o estado vazio do design, sem busca", async () => {
    const { container } = render(<CaixaDeNotificacoes itens={[]} />);
    expect(screen.getByText("Nenhuma notificação")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(await violacoesDoAxe(container)).toEqual([]);
  });
});
