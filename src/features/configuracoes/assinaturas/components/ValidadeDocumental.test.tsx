import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { violacoesDoAxe } from "@/components/ui/axe-de-teste";
import type { ModeloDeDocumento, MeusModelos } from "@/server/documentos/tipos";
import { DocumentosDoAtta } from "./DocumentosDoAtta";
import { ValidadeDocumental } from "./ValidadeDocumental";

// dados fictícios
const modelo = (m: Partial<ModeloDeDocumento>): ModeloDeDocumento => ({
  id: m.titulo ?? "x",
  tipo: "autorizacao_uso_imagem",
  titulo: "Modelo",
  estado: "ativo",
  versaoAtual: 1,
  frequencia: "unica",
  validadeMeses: 12,
  obrigatorio: false,
  procedimentos: [],
  publicadoEm: "2026-11-01T12:00:00Z",
  assinados: 0,
  atualizadoEm: "2026-11-01T12:00:00Z",
  acoes: [],
  ...m,
});
const resumo = { ativos: null, obrigatorios: null, opcionais: null, vencendo: null, vencidos: null, assinados: null, percentualAttaSign: null };
const lista = (modelos: ModeloDeDocumento[]) => ({ ok: true as const, data: { modelos, resumo } satisfies MeusModelos });

describe("Validade documental (captura 46; R46, só leitura; PDD RN-V-01)", () => {
  it("lista só os modelos Única ativos, com a validade em meses ou indeterminada, e leva a Termos & Docs", () => {
    render(
      <ValidadeDocumental
        modelos={lista([
          modelo({ titulo: "Uso de imagem", validadeMeses: 12, obrigatorio: false }),
          modelo({ titulo: "Contrato anual", validadeMeses: null, obrigatorio: true, versaoAtual: 3 }),
          modelo({ titulo: "Rascunho único", estado: "rascunho", versaoAtual: null }),
          modelo({ titulo: "Antigo", estado: "inativo" }),
          modelo({ titulo: "TCLE botox", frequencia: "por_procedimento", validadeMeses: null }),
          modelo({ titulo: "Cuidados pós", frequencia: "por_procedimento", validadeMeses: null }),
          modelo({ titulo: "Velho por procedimento", frequencia: "por_procedimento", estado: "inativo" }),
        ])}
      />,
    );
    const tabela = screen.getByRole("table", { name: /frequência Única/ });
    const linhas = within(tabela).getAllByRole("row").slice(1);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toHaveTextContent("Uso de imagemv1Ativo12 mesesOpcional");
    expect(linhas[1]).toHaveTextContent("Contrato anualv3AtivoIndeterminadaObrigatório");
    expect(screen.getByRole("link", { name: "Abrir Uso de imagem em Termos & Docs" })).toHaveAttribute("href", "/painel/documentos");
    expect(screen.queryByRole("spinbutton")).toBeNull(); // sem edição de validade aqui (R46)
    expect(screen.getByText('2 modelo(s) "Por procedimento" sem validade: TCLE botox, Cuidados pós.')).toBeInTheDocument();
  });

  it("sem escolha de obrigatório mostra —", () => {
    render(<ValidadeDocumental modelos={lista([modelo({ titulo: "Uso de imagem", obrigatorio: null })])} />);
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("—");
  });

  it("sem modelo Única ativo, avisa e não mostra rodapé vazio", () => {
    render(<ValidadeDocumental modelos={lista([])} />);
    expect(screen.getByText('Nenhum modelo "Única" ativo.')).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText(/Por procedimento/)).toBeNull();
  });

  it("se a leitura falhar, avisa sem quebrar a seção", () => {
    render(<ValidadeDocumental modelos={{ ok: false, error: { code: "SEM_PERMISSAO", message: "x" } }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não conseguimos carregar os modelos agora.");
  });

  it("não tem violação de acessibilidade", async () => {
    const { container } = render(<ValidadeDocumental modelos={lista([modelo({ titulo: "Uso de imagem" })])} />);
    expect(await violacoesDoAxe(container)).toEqual([]);
  });
});

describe("Documentos do ATTA que o paciente assina (captura 46; R46; PDD §16 e §17.2)", () => {
  it("descreve a regra dos 3 documentos da plataforma, com o Aviso em 12 meses fixos", () => {
    render(<DocumentosDoAtta />);
    const tabela = screen.getByRole("table", { name: /Tabela dos documentos do ATTA/ });
    const linhas = within(tabela).getAllByRole("rowheader").map((c) => c.textContent);
    expect(linhas).toEqual([
      "Termo de Uso do Check-in Digital (Paciente)",
      "Aviso de Privacidade do Paciente e Registro de Ciência",
      expect.stringMatching(/^Quadro de Identificação da Controladora/),
    ]);
    expect(tabela).toHaveTextContent("12 meses, fixos da plataforma.");
    expect(screen.queryByRole("checkbox")).toBeNull(); // só leitura
  });

  it("não tem violação de acessibilidade", async () => {
    const { container } = render(<DocumentosDoAtta />);
    expect(await violacoesDoAxe(container)).toEqual([]);
  });
});
