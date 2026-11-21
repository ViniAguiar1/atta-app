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
};

describe("verificação pública", () => {
  it("documento válido: as 5 linhas da captura 54, sem afirmar conferência que o servidor ainda não faz", () => {
    render(<ResultadoDaVerificacao resultado={{ ok: true, data: VALIDO }} />);
    const r = screen.getByRole("region", { name: "Resultado da verificação" });
    expect(within(r).getAllByRole("term").map((t) => t.textContent)).toEqual(["Documento", "Estado", "Assinatura", "Estabelecimento", "Integridade"]);
    expect(within(r).getByText("Existe")).toBeInTheDocument();
    expect(within(r).getByText("Termo de Autorização de Uso de Imagem de Assinatura Digital")).toBeInTheDocument();
    expect(within(r).getByText("Assinado")).toBeInTheDocument();
    expect(within(r).getByText("2026-03-04 10:12")).toBeInTheDocument(); // horário de Brasília
    expect(within(r).getByText("Clínica Aurora Estética")).toBeInTheDocument();
    expect(within(r).getByText(`SHA-256 da evidência: ${"9f".repeat(32)}`)).toBeInTheDocument();
    expect(within(r).queryByText(/Confere|recalculado/)).toBeNull();
  });

  it("estado sem tela própria mostra só o nome do estado do PDD, no mesmo chip", () => {
    render(<ResultadoDaVerificacao resultado={{ ok: true, data: { ...VALIDO, status: "substituido" } }} />);
    expect(screen.getByText("Substituído")).toBeInTheDocument();
  });

  it("código inexistente (ou malformado) e limite de consultas", () => {
    render(<ResultadoDaVerificacao resultado={{ ok: true, data: { ...VALIDO, exists: false, document_type: null, status: null, signed_at: null, tenant_trade_name: null, evidence_sha256: null, template_version: null, level: null } }} />);
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
