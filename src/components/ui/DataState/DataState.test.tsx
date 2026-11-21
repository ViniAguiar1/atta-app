import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { estadoDeDados } from "./estado-de-dados";
import { textos } from "./textos";
import { DataState, type EstadoDeDados } from ".";

// Os quatro estados de planning/05 §4.5, testados uma vez aqui (planning/08 §9.4, ATIN-160). Cada tela que lê dados
// só prova que entrega o estado ao DataState, com o estadoDeDados() de ./estado-de-dados.ts.
const vazio = {
  titulo: "Nenhum agendamento hoje",
  texto: "Os agendamentos do dia aparecem aqui.",
  acao: { rotulo: "Novo agendamento", aoClicar: vi.fn() },
};

function desenhar(estado: EstadoDeDados) {
  return render(
    <DataState estado={estado} rotulo="Agendamentos de hoje" esqueleto={{ linhas: 4, alturaRem: 3.5 }} vazio={vazio}>
      <table aria-label="Tabela de agendamentos" />
    </DataState>,
  );
}

const erro = (codigo?: string): EstadoDeDados => ({ tipo: "erro", tentarDeNovo: vi.fn(), codigo });

describe("carregando", () => {
  it("mostra o esqueleto com a altura do conteúdo, anuncia o carregamento e esconde o conteúdo", () => {
    const { container } = desenhar({ tipo: "carregando" });
    expect(estadoDeDados(container)).toBe("carregando");
    expect(screen.getByRole("status").textContent).toBe(textos.carregando);
    expect(screen.getByLabelText("Agendamentos de hoje").getAttribute("aria-busy")).toBe("true");
    const linhas = container.querySelectorAll<HTMLElement>("[data-esqueleto]");
    expect(linhas).toHaveLength(4);
    linhas.forEach((linha) => expect(linha.style.height).toBe("3.5rem"));
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("vazio", () => {
  it("mostra o título e o texto da tela e a ação primária", () => {
    const { container } = desenhar({ tipo: "vazio" });
    expect(estadoDeDados(container)).toBe("vazio");
    expect(screen.getByRole("status").textContent).toContain(vazio.titulo);
    expect(screen.getByText(vazio.texto)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Novo agendamento" }));
    expect(vazio.acao.aoClicar).toHaveBeenCalledOnce();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("sem ação na tela, mostra só o título e o texto, sem botão", () => {
    const { container } = render(
      <DataState
        estado={{ tipo: "vazio" }}
        rotulo="Agendamentos de hoje"
        esqueleto={{ linhas: 4, alturaRem: 3.5 }}
        vazio={{ titulo: vazio.titulo }}
      >
        <table aria-label="Tabela de agendamentos" />
      </DataState>,
    );
    expect(estadoDeDados(container)).toBe("vazio");
    expect(screen.getByRole("status").textContent).toBe(vazio.titulo);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("sem resultado", () => {
  it("diz que o filtro não achou nada e oferece limpar filtros, não a ação de criar", () => {
    const limparFiltros = vi.fn();
    const { container } = desenhar({ tipo: "sem-resultado", limparFiltros });
    expect(estadoDeDados(container)).toBe("sem-resultado");
    expect(screen.getByRole("status").textContent).toContain(textos.semResultado.titulo);
    expect(screen.queryByText(vazio.titulo)).toBeNull();
    expect(screen.queryByRole("button", { name: "Novo agendamento" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: textos.semResultado.acao }));
    expect(limparFiltros).toHaveBeenCalledOnce();
  });
});

describe("sem acesso (S2 da QA no stage, 21/11)", () => {
  it("SEM_PERMISSAO do banco vira o \"sem acesso\": sem alerta, sem código técnico e sem \"tentar de novo\"", () => {
    const { container } = desenhar(erro("SEM_PERMISSAO"));
    expect(estadoDeDados(container)).toBe("sem-acesso");
    expect(screen.getByRole("status").textContent).toContain(textos.semAcesso.titulo);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.textContent).not.toContain("SEM_PERMISSAO");
    expect(screen.queryByRole("button", { name: textos.erro.acao })).toBeNull();
  });
});

describe("erro", () => {
  it("é um alerta com tentar de novo e o código para o suporte", () => {
    const estado = erro("3f2a9c");
    const { container } = desenhar(estado);
    expect(estadoDeDados(container)).toBe("erro");
    expect(screen.getByRole("alert").textContent).toContain(textos.erro.titulo);
    expect(screen.getByText("3f2a9c")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: textos.erro.acao }));
    if (estado.tipo === "erro") expect(estado.tentarDeNovo).toHaveBeenCalledOnce();
  });

  it("sem código, não mostra a linha do suporte", () => {
    desenhar(erro());
    expect(screen.queryByText(textos.erro.codigo)).toBeNull();
  });

  it("nunca se parece com o vazio: papel, título, ação e borda diferentes", () => {
    const comErro = desenhar(erro());
    const quadroErro = comErro.container.querySelector("[data-estado]");
    const papelErro = screen.queryByRole("alert");
    const tituloErro = screen.queryByText(vazio.titulo);
    const acoesErro = screen.getAllByRole("button").map((b) => b.textContent);
    comErro.unmount();

    const semNada = desenhar({ tipo: "vazio" });
    const quadroVazio = semNada.container.querySelector("[data-estado]");

    expect(papelErro).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(tituloErro).toBeNull();
    expect(acoesErro).toEqual([textos.erro.acao]);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([vazio.acao.rotulo]);
    expect(quadroErro?.className).toContain("border-status-negative");
    expect(quadroVazio?.className).not.toContain("status-negative");
    expect(quadroErro?.querySelector("svg")).not.toBeNull();
    expect(quadroVazio?.querySelector("svg")).toBeNull();
  });
});

describe("pronto", () => {
  it("desenha só o conteúdo, sem moldura de estado", () => {
    const { container } = desenhar({ tipo: "pronto" });
    expect(estadoDeDados(container)).toBe("pronto");
    expect(screen.getByRole("table", { name: "Tabela de agendamentos" })).toBeDefined();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

it("cada estado tem um quadro só, e nenhum mostra a ação de outro", () => {
  const estados: EstadoDeDados[] = [
    { tipo: "carregando" },
    { tipo: "vazio" },
    { tipo: "sem-resultado", limparFiltros: vi.fn() },
    erro(),
  ];
  const acoes = estados.map((estado) => {
    const { container, unmount } = desenhar(estado);
    expect(container.querySelectorAll("[data-estado]")).toHaveLength(1);
    const nomes = screen.queryAllByRole("button").map((b) => b.textContent);
    unmount();
    return nomes;
  });
  expect(acoes).toEqual([[], [vazio.acao.rotulo], [textos.semResultado.acao], [textos.erro.acao]]);
});

it("o tipo recusa erro sem tentar de novo e sem resultado sem limpar filtros", () => {
  // @ts-expect-error erro precisa de tentarDeNovo
  const semTentar: EstadoDeDados = { tipo: "erro" };
  // @ts-expect-error sem-resultado precisa de limparFiltros
  const semLimpar: EstadoDeDados = { tipo: "sem-resultado" };
  expect([semTentar.tipo, semLimpar.tipo]).toEqual(["erro", "sem-resultado"]);
});
