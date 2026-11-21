import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { falha, ok } from "@/lib/errors";
import type { SituacaoImportacao as SituacaoDaImportacao } from "@/server/importacao/porta";
import type { AcoesDaImportacao } from "@/components/importacao/FluxoDeImportacao";
import { TelaImportacao } from "./TelaImportacao";

const acoes = {} as AcoesDaImportacao;
const situacao = (mais: Partial<SituacaoDaImportacao> = {}): SituacaoDaImportacao => ({
  subscription_since: "2026-10-21",
  quota_until: "2027-01-21",
  included: { used: 0, total: 2 },
  price_per_import_cents: 3990,
  full_import_price_cents: 3990,
  full_import_contracted: false,
  imports: [],
  ...mais,
});

describe("Configurações › Importação de pacientes (captura 48)", () => {
  it("faixa Quem importa, cota e preços vindos da API (o do PDD), sem linha de demonstração nem botão de contratar", () => {
    render(<TelaImportacao resultado={ok(situacao())} acoes={acoes} hoje="2026-11-21" />);
    expect(screen.getByRole("note")).toHaveTextContent("Quem importa. A importação de base é feita só pelo gestor (ADMIN).");
    expect(screen.getByText("Incluída · importação da base (1 de 2)")).toBeInTheDocument();
    expect(screen.getByText("R$ 39,90 · por importação depois dos 3 meses")).toBeInTheDocument();
    expect(screen.getByText(/assinatura desde 21\/10\/2026; cota vale até 21\/01\/2027/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Importar base de pacientes" })).toBeInTheDocument();
    expect(screen.queryByText(/Demonstração/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Contratar importação completa" })).toBeNull();
  });

  it("a cota: a complementar é a 2 de 2; usada ou vencida, o chip some; completa contratada vira chip", () => {
    const { rerender } = render(<TelaImportacao resultado={ok(situacao({ included: { used: 1, total: 2 } }))} acoes={acoes} hoje="2026-11-21" />);
    expect(screen.getByText("Incluída · importação complementar (2 de 2)")).toBeInTheDocument();
    rerender(<TelaImportacao resultado={ok(situacao())} acoes={acoes} hoje="2027-02-01" />);
    expect(screen.queryByText(/Incluída/)).toBeNull();
    rerender(<TelaImportacao resultado={ok(situacao({ full_import_contracted: true }))} acoes={acoes} hoje="2026-11-21" />);
    expect(screen.getByText("Contratada")).toBeInTheDocument();
  });

  it("carregando e erro pelo DataState", () => {
    const { rerender, container } = render(<TelaImportacao resultado={null} acoes={acoes} hoje="2026-11-21" />);
    expect(container.querySelector('[data-estado="carregando"]')).not.toBeNull();
    rerender(<TelaImportacao resultado={falha("INDISPONIVEL", "x")} acoes={acoes} hoje="2026-11-21" />);
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
    expect(vi.isMockFunction(acoes.declarar)).toBe(false);
  });
});
