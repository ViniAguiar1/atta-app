import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessaoDoPainel } from "../sessao";

const sessao = vi.fn<() => Promise<SessaoDoPainel | null>>();
vi.mock("../sessao", () => ({ sessaoDoPainel: () => sessao() }));
vi.mock("next/server", () => ({ connection: async () => {} }));
const { GuardaDoModulo } = await import("./GuardaDoModulo");

const base: SessaoDoPainel = { clinica: "Clínica Fictícia", pessoa: { nome: "Ana Exemplo" }, papel: "COLABORADOR", permissoes: [], notificacoes: 0 };
const abrir = async (href: string) => render((await GuardaDoModulo({ href, rotulo: "Módulo", children: <p>tela do módulo</p> })) as React.ReactElement);

beforeEach(() => {
  sessao.mockReset();
  cleanup();
});

// PDD §10.4.3: o acesso do Colaborador é módulo a módulo (S2 da QA no stage, 21/11)
describe("guarda de rota do módulo", () => {
  it("Colaborador sem documents.view vê o \"sem acesso\" em Termos & Docs, sem a tela", async () => {
    sessao.mockResolvedValue({ ...base, permissoes: ["appointments.view", "patients.view", "atta.view"] });
    await abrir("/painel/documentos");
    expect(screen.getByText("Você não tem acesso a este módulo")).toBeInTheDocument();
    expect(screen.queryByText("tela do módulo")).toBeNull();
  });

  it("Colaborador com a permissão do módulo e o ADMIN abrem a tela", async () => {
    sessao.mockResolvedValue({ ...base, permissoes: ["appointments.view"] });
    await abrir("/painel/agenda");
    expect(screen.getByText("tela do módulo")).toBeInTheDocument();
    cleanup();
    sessao.mockResolvedValue({ ...base, papel: "ADMIN" });
    await abrir("/painel/documentos");
    expect(screen.getByText("tela do módulo")).toBeInTheDocument();
  });

  it("sem sessão, o \"sem acesso\"", async () => {
    sessao.mockResolvedValue(null);
    await abrir("/painel/pacientes");
    expect(screen.queryByText("tela do módulo")).toBeNull();
  });
});
