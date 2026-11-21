import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { estadoDeDados } from "@/components/ui/DataState/estado-de-dados";
import { falha, ok, type Resultado } from "@/lib/errors";
import type { LinhaDePaciente, PaginaDePacientes } from "@/server/pacientes/porta";
import { ListaDePacientes } from "./ListaDePacientes";

// dados fictícios: CPF gerado, nome inventado
const juliana: LinhaDePaciente = {
  id: "5a5a0000-0000-4000-8000-000000000001",
  nome: "Juliana Prates",
  usaNomeSocial: false,
  incompleto: false,
  selo: "com_selo",
  identificacao: { tipo: "cpf", mascarado: "···.···.247-25" },
  nascimento: "1990-09-17",
  contato: { celular: "(11) ·····-4321", email: "ju···@exemplo.test" },
  atendimento: { tipo: "ultimo", em: "2026-11-20T11:00", procedimento: "Bioestimulador de colágeno", profissional: "Dra. Helena Prado" },
};
const carla: LinhaDePaciente = {
  ...juliana,
  id: "5a5a0000-0000-4000-8000-000000000002",
  nome: "Carla Siqueira",
  usaNomeSocial: true,
  incompleto: true,
  identificacao: { tipo: "incompleto" },
  selo: null,
  nascimento: null,
  contato: null,
  atendimento: null,
};

const pagina = (itens: LinhaDePaciente[], extra: Partial<PaginaDePacientes> = {}): Resultado<PaginaDePacientes> =>
  ok({ itens, proxima: null, total: itens.length, contadores: { outra_clinica: 1, atendimento_hoje: 6, arquivados: 0 }, ...extra });

const montar = (props: Partial<React.ComponentProps<typeof ListaDePacientes>> = {}) => {
  const listar = vi.fn(async () => pagina([juliana, carla]));
  const buscar = vi.fn(async () => ok<LinhaDePaciente[]>([juliana]));
  const r = render(<ListaDePacientes inicial={pagina([juliana, carla])} listar={listar} buscar={buscar} {...props} />);
  return { ...r, listar: props.listar ?? listar, buscar: props.buscar ?? buscar };
};

describe("lista de Pacientes (MIG-43; simulador, capturas 09 a 11)", () => {
  it("as 4 colunas do simulador", () => {
    montar();
    const titulos = screen.getAllByRole("columnheader").map((c) => c.textContent);
    expect(titulos).toEqual(["Paciente", "Identificação", "Contato", "Atendimento"]);
  });

  it("cada célula no formato do simulador", () => {
    montar();
    const linha = within(screen.getByRole("row", { name: /Juliana Prates/ }));
    expect(linha.getByText("CPF terminado em 247-25")).toHaveClass("sr-only");
    expect(linha.getByText("···.···.247-25")).toHaveAttribute("aria-hidden", "true");
    expect(linha.getByText("Nasc. 17/09/1990")).toBeInTheDocument();
    expect(linha.getByText("(11) ·····-4321")).toBeInTheDocument();
    expect(linha.getByText("Com selo")).toBeInTheDocument();
    expect(linha.getByText("Último atendimento")).toBeInTheDocument();
    expect(linha.getByText("20/11/2026 às 11:00")).toHaveClass("font-semibold");
    expect(linha.getByText("Bioestimulador de colágeno · Dra. Helena Prado")).toBeInTheDocument();
  });

  it("sem dado: Incompleto, nome social, Sem documento, Sem celular, Sem e-mail e Nenhum atendimento aqui", () => {
    montar();
    const linha = within(screen.getByRole("row", { name: /Carla Siqueira/ }));
    expect(linha.getByText("Incompleto")).toBeInTheDocument();
    expect(linha.getByRole("rowheader")).toHaveTextContent("Carla Siqueira*, usa nome social");
    // o nome abre a Pasta (PDD §10, Pacientes, lista): só o id na URL
    expect(linha.getByRole("link", { name: "Abrir a pasta de Carla Siqueira" })).toHaveAttribute("href", expect.stringMatching(/^\/painel\/pacientes\/pasta\/[0-9a-f-]{36}$/));
    expect(linha.getByText("Nascimento não informado")).toHaveClass("sr-only");
    expect(linha.queryByText("Com selo")).toBeNull();
    for (const t of ["Sem documento", "Sem celular", "Sem e-mail", "Nenhum atendimento aqui"]) {
      expect(linha.getByText(t)).toBeInTheDocument();
    }
  });

  it("rodapé com o total e Carregar mais pelo cursor", async () => {
    const mais = pagina([carla], { total: 2 });
    const listar = vi.fn(async () => mais);
    montar({ inicial: pagina([juliana], { proxima: { nome: "Juliana Prates", id: juliana.id }, total: 2 }), listar });
    expect(screen.getByText("1 de 2 ativo(s)")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Carregar mais pacientes" }));
    expect(await screen.findByText("2 de 2 ativo(s)")).toBeInTheDocument();
    expect(listar).toHaveBeenCalledWith({ nome: "Juliana Prates", id: juliana.id });
    expect(screen.queryByRole("button", { name: "Carregar mais pacientes" })).not.toBeInTheDocument();
  });

  it("busca por nome no corpo da action; termo curto não busca e explica", async () => {
    const { buscar } = montar();
    const campo = screen.getByRole("searchbox", { name: "Buscar paciente por nome ou CPF" });
    await userEvent.type(campo, "j");
    expect(screen.getByText("Digite ao menos 2 letras do nome ou o CPF completo.")).toBeInTheDocument();
    await userEvent.type(campo, "u");
    await waitFor(() => expect(buscar).toHaveBeenCalledWith({ termo: "ju" }));
    await waitFor(() => expect(screen.getByText("1 paciente encontrado")).toHaveClass("sr-only"));
    await waitFor(() => expect(screen.queryByRole("row", { name: /Carla/ })).not.toBeInTheDocument());
  });

  it("busca sem resultado mostra o estado e Limpar filtros volta para a lista", async () => {
    const { container } = montar({ buscar: vi.fn(async () => ok<LinhaDePaciente[]>([])) });
    await userEvent.type(screen.getByRole("searchbox"), "zz");
    await waitFor(() => expect(estadoDeDados(container)).toBe("sem-resultado"));
    await userEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(estadoDeDados(container)).toBe("pronto");
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("lista vazia é o estado vazio; erro é o estado de erro, e Tentar de novo chama a lista", async () => {
    const vazio = montar({ inicial: pagina([]) });
    expect(estadoDeDados(vazio.container)).toBe("vazio");
    vazio.unmount();

    const listar = vi.fn(async () => pagina([juliana]));
    const { container } = montar({ inicial: falha("INDISPONIVEL", "fora"), listar });
    expect(estadoDeDados(container)).toBe("erro");
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(estadoDeDados(container)).toBe("pronto"));
    expect(listar).toHaveBeenCalledWith();
  });

  describe("filtros (captura 11)", () => {
    it("o botão Filtros abre o menu com os três filtros e os contadores do banco; o Esc fecha e devolve o foco", async () => {
      montar();
      const botao = screen.getByRole("button", { name: "Filtros" });
      await userEvent.click(botao);
      expect(botao).toHaveAttribute("aria-expanded", "true");
      const menu = screen.getByRole("list", { name: "Filtrar pacientes" });
      expect(within(menu).getAllByRole("button").map((b) => b.textContent)).toEqual([
        "Cadastrados em outra clínica11 paciente",
        "Com atendimento hoje66 pacientes",
        "Arquivados00 pacientes",
      ]);
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("list", { name: "Filtrar pacientes" })).toBeNull();
      expect(botao).toHaveFocus();
    });

    it("escolher um filtro relê a lista com ele; o Limpar filtros volta à lista dos ativos", async () => {
      const { listar } = montar();
      await userEvent.click(screen.getByRole("button", { name: "Filtros" }));
      await userEvent.click(screen.getByRole("button", { name: /Com atendimento hoje/ }));
      await waitFor(() => expect(listar).toHaveBeenLastCalledWith(undefined, "atendimento_hoje"));
      await userEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
      await waitFor(() => expect(listar).toHaveBeenLastCalledWith());
      expect(screen.queryByRole("button", { name: "Limpar filtros" })).toBeNull();
    });

    it("filtro sem resultado: o sem-resultado limpa o filtro; a busca leva o filtro junto", async () => {
      const listar = vi.fn(async (_apos?: unknown, filtro?: string) => (filtro ? pagina([], { contadores: null }) : pagina([juliana, carla])));
      const buscar = vi.fn(async () => ok<LinhaDePaciente[]>([]));
      montar({ listar, buscar });
      await userEvent.click(screen.getByRole("button", { name: "Filtros" }));
      await userEvent.click(screen.getByRole("button", { name: /Arquivados/ }));
      expect(await screen.findByText("Nenhum resultado para os filtros aplicados")).toBeInTheDocument();
      await userEvent.type(screen.getByRole("searchbox"), "juli");
      await waitFor(() => expect(buscar).toHaveBeenLastCalledWith({ termo: "juli", filtro: "arquivados" }));
      await userEvent.clear(screen.getByRole("searchbox"));
      // o contador continua o último conhecido quando a página filtrada volta vazia
      await userEvent.click(screen.getByRole("button", { name: "Filtros" }));
      expect(screen.getByRole("button", { name: /Arquivados/ })).toHaveTextContent("0");
      await userEvent.keyboard("{Escape}");
      await userEvent.click(screen.getAllByRole("button", { name: "Limpar filtros" }).at(-1)!);
      await waitFor(() => expect(screen.getAllByRole("rowheader")).toHaveLength(2));
    });
  });
});
