import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { violacoesDoAxe } from "@/components/ui/axe-de-teste";
import { estadoDeDados } from "@/components/ui/DataState";
import { type AlertasDaEquipe, EVENTOS } from "@/server/alertas/tipos";
import { TelaNotificacoes } from "./TelaNotificacoes";

const acoes = vi.hoisted(() => ({ ligarCanal: vi.fn(), alterarCanal: vi.fn(), marcarEvento: vi.fn(), salvarFiltros: vi.fn() }));
vi.mock("../actions", () => acoes);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const DADOS: AlertasDaEquipe = {
  email: { ativo: true, destinoMascarado: "al·····@clinica-exemplo.test" },
  whatsapp: { ativo: false, destinoMascarado: null },
  eventos: EVENTOS.map((e) => ({ chave: e.chave, email: e.chave === "checkin_concluido", whatsapp: false })),
  filtros: { pausaNoturna: false, frequenciaDoResumo: "tempo_real" },
  emPausaNoturna: false,
};
const abrir = (dados: AlertasDaEquipe | null = DADOS) => render(<TelaNotificacoes resultado={{ ok: true, data: dados }} />);

describe("Configurações › Notificações (PDD §10.4.6, captura 45)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sem configuração legível (porta vazia), abre no estado vazio do design", () => {
    const { container } = abrir(null);
    expect(estadoDeDados(container)).toBe("vazio");
    expect(screen.getByText("Nenhum canal de alerta configurado")).toBeInTheDocument();
  });

  it("mostra os 3 cartões, os 10 eventos do PDD em 3 categorias e a contagem por canal", () => {
    abrir();
    expect(screen.getByRole("region", { name: "Canais disponíveis" })).toBeInTheDocument();
    const eventos = screen.getByRole("region", { name: "Eventos configuráveis" });
    expect(eventos).toHaveTextContent("10 eventos em 3 categorias");
    expect(eventos).toHaveTextContent("E-mail: 1 de 10");
    expect(eventos).toHaveTextContent("WhatsApp: 0 de 10");
    const tabela = within(eventos).getByRole("table");
    expect(within(tabela).getAllByRole("rowheader")).toHaveLength(10);
    for (const c of ["Check-in & Atendimentos", "Documentos & Modelos", "Sistema & Conta"]) expect(tabela).toHaveTextContent(c);
    expect(screen.queryByText(/Crítico/)).toBeNull();
    expect(screen.getByRole("region", { name: "Filtros de produtividade & silêncio" })).toHaveTextContent("Fora da pausa noturna");
  });

  it("com o WhatsApp desligado, a coluna dele fica desabilitada e o cabeçalho avisa", () => {
    abrir();
    expect(screen.getByRole("checkbox", { name: "Documento assinado por WhatsApp" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Documento assinado por E-mail" })).toBeEnabled();
    expect(screen.getByRole("columnheader", { name: /WhatsApp \(consome mensagem\) \(desligado\)/ })).toBeInTheDocument();
  });

  it("marcar um evento grava e passa a mostrar o que o servidor guardou", async () => {
    const depois = { ...DADOS, eventos: DADOS.eventos.map((e) => (e.chave === "documento_assinado" ? { ...e, email: true } : e)) };
    acoes.marcarEvento.mockResolvedValue({ ok: true, data: depois });
    abrir();
    await userEvent.click(screen.getByRole("checkbox", { name: "Documento assinado por E-mail" }));
    expect(acoes.marcarEvento).toHaveBeenCalledWith({ chave: "documento_assinado", canal: "email", marcado: true });
    await waitFor(() => expect(screen.getByRole("region", { name: "Eventos configuráveis" })).toHaveTextContent("E-mail: 2 de 10"));
  });

  it("o e-mail chega só mascarado; o campo troca o destino pela ação própria e mostra a recusa no campo", async () => {
    acoes.alterarCanal.mockResolvedValue({ ok: false, error: { code: "VALIDACAO", message: "x", reason: "ATTA-IN-0001:destino" } });
    abrir();
    expect(screen.getByText("E-mail cadastrado: al·····@clinica-exemplo.test")).toBeInTheDocument();
    const campo = screen.getByLabelText("E-mail que recebe os alertas");
    expect(campo).toHaveValue("");
    await userEvent.type(campo, "errado{enter}");
    expect(acoes.alterarCanal).toHaveBeenCalledWith({ canal: "email", destino: "errado" });
    await waitFor(() => expect(campo).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getAllByText("Informe um e-mail válido, como nome@clinica.com.br.").length).toBeGreaterThan(0);
  });

  it("não há violação do axe", async () => {
    const { container } = abrir();
    expect(await violacoesDoAxe(container)).toEqual([]);
  });
});
