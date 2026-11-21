import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dataDaAssinatura } from "../formatos";
import { FormularioDoCodigo } from "./FormularioDoCodigo";
import { ResultadoDaVerificacao } from "./ResultadoDaVerificacao";

const roteador = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => roteador }));
afterEach(cleanup);

// Resposta fictícia, nas 8 chaves da ADR 0006 §6 (sem dado pessoal).
const VALIDO = {
  exists: true, tenant_trade_name: "Clínica Aurora Estética", document_type: "termo_de_autorizacao", template_version: 1,
  signed_at: "2026-03-04T13:12:00.000Z", status: "assinado_definitivo" as const, evidence_sha256: "9f".repeat(32), level: "atta_sign",
  tenant_cnpj: "41.218.605/0001-37", integrity: "confere" as const,
};

describe("verificação pública", () => {
  it("documento válido: as 5 linhas da captura 54, com o CNPJ assinado e a integridade conferida no servidor", () => {
    render(<ResultadoDaVerificacao resultado={{ ok: true, data: VALIDO }} />);
    const r = screen.getByRole("region", { name: "Resultado da verificação" });
    expect(within(r).getAllByRole("term").map((t) => t.textContent)).toEqual(["Documento", "Estado", "Assinatura", "Estabelecimento", "Integridade"]);
    expect(within(r).getByText("Existe")).toBeInTheDocument();
    expect(within(r).getByText("Termo de Autorização de Uso de Imagem de Assinatura Digital")).toBeInTheDocument();
    expect(within(r).getByText("Assinado")).toBeInTheDocument();
    expect(within(r).getByText("2026-03-04 10:12")).toBeInTheDocument(); // horário de Brasília
    expect(within(r).getByText("Clínica Aurora Estética · CNPJ 41.218.605/0001-37")).toBeInTheDocument();
    expect(within(r).getByText("Confere com a evidência")).toBeInTheDocument();
    expect(within(r).getByText(`SHA-256 recalculado: ${"9f".repeat(32)}`)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Documento encontrado: Termo de Autorização de Uso de Imagem de Assinatura Digital. Estado: Assinado.");
  });

  it("integridade que não confere: aviso antes da tabela e chip negativo, sem o \"recalculado\"", () => {
    render(<ResultadoDaVerificacao resultado={{ ok: true, data: { ...VALIDO, integrity: "nao_confere" } }} />);
    const r = screen.getByRole("region", { name: "Resultado da verificação" });
    const aviso = within(r).getAllByText(/A integridade deste documento não confere/).find((e) => !e.closest(".sr-only"))!;
    expect(aviso.compareDocumentPosition(within(r).getByText("Documento")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(r).getByText("Não confere com a evidência")).toBeInTheDocument();
    expect(within(r).queryByText(/recalculado/)).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(/não confere/);
  });

  it("sem integridade (documento antigo): só o hash guardado, sem afirmar conferência", () => {
    render(<ResultadoDaVerificacao resultado={{ ok: true, data: { ...VALIDO, integrity: null } }} />);
    expect(screen.getByText(`SHA-256 da evidência: ${"9f".repeat(32)}`)).toBeInTheDocument();
    expect(screen.queryByText(/Confere|recalculado/)).toBeNull();
  });

  it("estado sem tela própria mostra só o nome do estado do PDD, no mesmo chip", () => {
    render(<ResultadoDaVerificacao resultado={{ ok: true, data: { ...VALIDO, status: "substituido" } }} />);
    expect(screen.getByText("Substituído")).toBeInTheDocument();
  });

  it("código inexistente (ou malformado) e limite de consultas", () => {
    render(<ResultadoDaVerificacao resultado={{ ok: true, data: { ...VALIDO, exists: false, document_type: null, status: null, signed_at: null, tenant_trade_name: null, evidence_sha256: null, template_version: null, level: null, tenant_cnpj: null, integrity: null } }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Código não encontrado. Confira os 12 caracteres.");
    expect(screen.queryByRole("region")).toBeNull();
    cleanup();
    render(<ResultadoDaVerificacao resultado={{ ok: false, error: { code: "LIMITE", message: "x" } }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Aguarde um minuto");
  });

  it("o formulário vai para /verificar/<código>, sem mexer no código (quem normaliza é o servidor)", async () => {
    render(<FormularioDoCodigo />);
    await userEvent.type(screen.getByLabelText("Código ATTA"), " atta-k7m2-9qrx-4t1v ");
    await userEvent.click(screen.getByRole("button", { name: "Verificar" }));
    expect(roteador.push).toHaveBeenCalledWith("/verificar/atta-k7m2-9qrx-4t1v");
  });

  it("data da assinatura no formato da captura, no horário de Brasília", () => {
    expect(dataDaAssinatura("2026-03-04T13:12:00.000Z")).toBe("2026-03-04 10:12");
    expect(dataDaAssinatura("2026-12-31T23:59:00.000Z")).toBe("2026-12-31 20:59");
  });
});
