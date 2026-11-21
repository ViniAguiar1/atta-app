import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { falha, ok } from "@/lib/errors";
import type { SituacaoImportacao as SituacaoDaImportacao } from "@/server/importacao/porta";
import type { AcoesDaImportacao } from "@/components/importacao/FluxoDeImportacao";
import { TelaImportacao } from "./TelaImportacao";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
});

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
    render(<TelaImportacao resultado={ok(situacao())} acoes={acoes} hoje="2026-11-21" fuso="America/Sao_Paulo" />);
    expect(screen.getByRole("note")).toHaveTextContent("Quem importa. A importação de base é feita só pelo gestor (ADMIN).");
    expect(screen.getByText("Incluída · importação da base (1 de 2)")).toBeInTheDocument();
    expect(screen.getByText("R$ 39,90 · por importação depois dos 3 meses")).toBeInTheDocument();
    expect(screen.getByText(/assinatura desde 21\/10\/2026; cota vale até 21\/01\/2027/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Importar base de pacientes" })).toBeInTheDocument();
    expect(screen.queryByText(/Demonstração/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Contratar importação completa" })).toBeNull();
  });

  it("a cota: a complementar é a 2 de 2; usada ou vencida, o chip some; completa contratada vira chip", () => {
    const { rerender } = render(<TelaImportacao resultado={ok(situacao({ included: { used: 1, total: 2 } }))} acoes={acoes} hoje="2026-11-21" fuso="America/Sao_Paulo" />);
    expect(screen.getByText("Incluída · importação complementar (2 de 2)")).toBeInTheDocument();
    rerender(<TelaImportacao resultado={ok(situacao())} acoes={acoes} hoje="2027-02-01" fuso="America/Sao_Paulo" />);
    expect(screen.queryByText(/Incluída/)).toBeNull();
    rerender(<TelaImportacao resultado={ok(situacao({ full_import_contracted: true }))} acoes={acoes} hoje="2026-11-21" fuso="America/Sao_Paulo" />);
    expect(screen.getByText("Contratada")).toBeInTheDocument();
  });

  it("carregando e erro pelo DataState", () => {
    const { rerender, container } = render(<TelaImportacao resultado={null} acoes={acoes} hoje="2026-11-21" fuso="America/Sao_Paulo" />);
    expect(container.querySelector('[data-estado="carregando"]')).not.toBeNull();
    rerender(<TelaImportacao resultado={falha("INDISPONIVEL", "x")} acoes={acoes} hoje="2026-11-21" fuso="America/Sao_Paulo" />);
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
  });

  it("depois de \"Importação recebida\", fechar relê a página (a cota não fica velha) e o tentar de novo usa o refresh", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
    const completas: AcoesDaImportacao = {
      urlDoModelo: vi.fn(async () => ok({ url: "/modelos/planilha-de-pacientes.xlsx" })),
      declarar: vi.fn(async () => ok({ declaration_id: "dec-1" })),
      iniciarEnvio: vi.fn(async () => ok({ import_id: "imp-1", upload_url: "/api/importacao/simulado?id=imp-1" })),
      previa: vi.fn(async () => ok({ total: 1, valid: 1, errors: [], blanked: [] })),
      confirmar: vi.fn(async () => ok({ status: "processando" as const, due_at: "2026-11-26T15:00:00Z" })),
    };
    render(<TelaImportacao resultado={ok(situacao())} acoes={completas} hoje="2026-11-21" fuso="America/Sao_Paulo" />);
    await userEvent.click(screen.getByRole("button", { name: "Importar base de pacientes" }));
    const dialogo = screen.getByRole("dialog");
    await userEvent.click(within(dialogo).getByRole("checkbox"));
    await userEvent.upload(within(dialogo).getByLabelText("Escolher a planilha (.xlsx)"), new File([new Uint8Array(10)], "p.xlsx"));
    await userEvent.click(await within(dialogo).findByRole("button", { name: "Importar 1 paciente" }));
    await within(dialogo).findByRole("status");
    expect(refresh).not.toHaveBeenCalled();
    await userEvent.click(within(dialogo).getAllByRole("button", { name: "Fechar" }).at(-1)!);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
