import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { falha, ok } from "@/lib/errors";
import { violacoesDoAxe } from "@/components/ui/axe-de-teste";
import { FluxoDeImportacao, type AcoesDaImportacao } from "./FluxoDeImportacao";

// Só dado fictício: a planilha é um arquivo vazio com nome de exemplo; a prévia traz só números de linha e códigos.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
});

const acoesFalsas = (mais: Partial<AcoesDaImportacao> = {}) => {
  const acoes: AcoesDaImportacao = {
    urlDoModelo: vi.fn(async () => ok({ url: "https://exemplo.test/modelo.xlsx" })),
    declarar: vi.fn(async () => ok({ declaration_id: "dec-1" })),
    iniciarEnvio: vi.fn(async () => ok({ import_id: "imp-1", upload_url: "https://exemplo.test/upload" })),
    previa: vi.fn(async () =>
      ok({ total: 4, valid: 2, errors: [{ line: 3, code: "cpf_invalido" as const }, { line: 5, code: "repetido_diferente" as const }], blanked: [{ line: 4, field: "celular" as const }] }),
    ),
    confirmar: vi.fn(async () => ok({ status: "processando" as const, due_at: "2026-11-26T15:00:00Z" })),
    ...mais,
  };
  return acoes;
};
const planilha = (nome = "pacientes.xlsx", tamanho = 10) => new File([new Uint8Array(tamanho)], nome, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

async function abrir(acoes: AcoesDaImportacao, enviar = vi.fn(async () => true), fuso = "America/Sao_Paulo") {
  render(<FluxoDeImportacao acoes={acoes} fuso={fuso} enviarArquivo={enviar} />);
  await userEvent.click(screen.getByRole("button", { name: "Importar base de pacientes" }));
  return { dialogo: screen.getByRole("dialog", { name: "Importar base de pacientes" }), enviar };
}

describe("Importar base de pacientes (PDD §10.1; PLANO MIG-34)", () => {
  it("o envio só libera depois da declaração; a declaração, o envio assinado e a prévia vão em ordem", async () => {
    const acoes = acoesFalsas();
    const { dialogo, enviar } = await abrir(acoes);
    const arquivo = within(dialogo).getByLabelText("Escolher a planilha (.xlsx)");
    expect(arquivo).toBeDisabled();
    await userEvent.click(within(dialogo).getByRole("checkbox"));
    expect(arquivo).toBeEnabled();
    await userEvent.upload(arquivo, planilha());
    expect(await within(dialogo).findByText("2 de 4 linha(s) entram na importação.")).toBeInTheDocument();
    expect(acoes.declarar).toHaveBeenCalledWith({ versao: "2026-11-21" });
    expect(acoes.iniciarEnvio).toHaveBeenCalledWith({ declarationId: "dec-1", tamanho: 10 });
    expect(enviar).toHaveBeenCalledWith("https://exemplo.test/upload", expect.any(File));
    expect(acoes.previa).toHaveBeenCalledWith({ importId: "imp-1" });
    // fora da importação: só o número da linha e o motivo; em branco: aviso, não erro
    expect(dialogo).toHaveTextContent("Linha 3: CPF inválido");
    expect(dialogo).toHaveTextContent("Linha 5: mesmo CPF com dados diferentes (nenhuma das linhas entra)");
    expect(dialogo).toHaveTextContent("Linha 4: entra sem celular");
    expect(dialogo).toHaveTextContent("O processamento leva até 3 dias úteis.");
  });

  it("confirmar envia de vez e mostra o prazo; o foco vai à mensagem", async () => {
    const acoes = acoesFalsas();
    const { dialogo } = await abrir(acoes);
    await userEvent.click(within(dialogo).getByRole("checkbox"));
    await userEvent.upload(within(dialogo).getByLabelText("Escolher a planilha (.xlsx)"), planilha());
    await userEvent.click(await within(dialogo).findByRole("button", { name: "Importar 2 pacientes" }));
    expect(acoes.confirmar).toHaveBeenCalledWith({ importId: "imp-1" });
    const msg = await within(dialogo).findByRole("status");
    expect(msg).toHaveTextContent("Importação recebida. O processamento leva até 3 dias úteis (até 26/11/2026).");
    await waitFor(() => expect(msg).toHaveFocus());
  });

  it("o prazo sai no fuso da clínica: 26/11 01:30 UTC é 25/11 em São Paulo e 26/11 em Tóquio", async () => {
    const acoes = acoesFalsas({ confirmar: vi.fn(async () => ok({ status: "processando" as const, due_at: "2026-11-26T01:30:00Z" })) });
    const { dialogo } = await abrir(acoes, vi.fn(async () => true), "Asia/Tokyo");
    await userEvent.click(within(dialogo).getByRole("checkbox"));
    await userEvent.upload(within(dialogo).getByLabelText("Escolher a planilha (.xlsx)"), planilha());
    await userEvent.click(await within(dialogo).findByRole("button", { name: "Importar 2 pacientes" }));
    expect(await within(dialogo).findByRole("status")).toHaveTextContent("(até 26/11/2026)");
  });

  it("fora do modelo é recusado com a orientação de baixar o modelo de novo; o arquivo errado não sai da tela", async () => {
    const acoes = acoesFalsas({
      previa: vi.fn(async () => falha("VALIDACAO", "A planilha está fora do modelo. Baixe o modelo de novo e preencha a aba Pacientes.", [{ campo: "arquivo", code: "VALIDACAO" }])),
    });
    const { dialogo, enviar } = await abrir(acoes);
    await userEvent.click(within(dialogo).getByRole("checkbox"));
    const arquivo = within(dialogo).getByLabelText("Escolher a planilha (.xlsx)");
    await userEvent.upload(arquivo, planilha("outra.csv"), { applyAccept: false });
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("Envie a planilha modelo em .xlsx.");
    expect(acoes.declarar).not.toHaveBeenCalled();
    await userEvent.upload(arquivo, planilha());
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("Baixe a planilha modelo de novo");
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("VALIDACAO de outro campo não vira \"fora do modelo\"; a linha com nome inválido aparece com o motivo", async () => {
    const acoes = acoesFalsas({
      iniciarEnvio: vi.fn(async () => falha("VALIDACAO", "x", [{ campo: "tamanho", code: "VALIDACAO" }])),
    });
    const { dialogo } = await abrir(acoes);
    await userEvent.click(within(dialogo).getByRole("checkbox"));
    await userEvent.upload(within(dialogo).getByLabelText("Escolher a planilha (.xlsx)"), planilha());
    const alerta = await within(dialogo).findByRole("alert");
    expect(alerta).toHaveTextContent("Não foi possível concluir agora.");
    expect(alerta).not.toHaveTextContent("modelo");
  });

  it("acima de 20 MB nem começa; falha no envio do arquivo avisa e volta ao início", async () => {
    const acoes = acoesFalsas();
    const { dialogo } = await abrir(acoes, vi.fn(async () => false));
    await userEvent.click(within(dialogo).getByRole("checkbox"));
    const arquivo = within(dialogo).getByLabelText("Escolher a planilha (.xlsx)");
    await userEvent.upload(arquivo, planilha("grande.xlsx", 20 * 1024 * 1024 + 1));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("A planilha passa de 20 MB.");
    expect(acoes.declarar).not.toHaveBeenCalled();
    await userEvent.upload(arquivo, planilha());
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("Não foi possível enviar a planilha.");
    expect(acoes.previa).not.toHaveBeenCalled();
  });

  it("passa no axe com a prévia aberta", async () => {
    const acoes = acoesFalsas();
    const { dialogo } = await abrir(acoes);
    await userEvent.click(within(dialogo).getByRole("checkbox"));
    await userEvent.upload(within(dialogo).getByLabelText("Escolher a planilha (.xlsx)"), planilha());
    await within(dialogo).findByText("Prévia da importação", { selector: "h3" });
    expect(await violacoesDoAxe(dialogo)).toEqual([]);
  });

  it("a variante secundária (módulo Pacientes) só muda o botão que abre; o fluxo é o mesmo", async () => {
    render(<FluxoDeImportacao acoes={acoesFalsas()} fuso="America/Sao_Paulo" variante="secundario" />);
    const botao = screen.getByRole("button", { name: "Importar base de pacientes" });
    expect(botao.className).toContain("border-border-functional");
    expect(botao.className).not.toContain("bg-text-primary");
    await userEvent.click(botao);
    expect(screen.getByRole("dialog", { name: "Importar base de pacientes" })).toBeInTheDocument();
  });
});
