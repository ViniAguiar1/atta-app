import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { violacoesDoAxe } from "@/components/ui/axe-de-teste";
import { estadoDeDados } from "@/components/ui/DataState";
import type { ConfiguracaoDeAssinatura } from "@/server/assinaturas/tipos";
import { TelaAssinaturas } from "./TelaAssinaturas";

const acoes = vi.hoisted(() => ({ salvarModelo: vi.fn() }));
vi.mock("../actions", () => acoes);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const DADOS: ConfiguracaoDeAssinatura = {
  modelo: "rt_profissional",
  chancela: {
    nomeFantasia: "Clínica Exemplo",
    razaoSocial: "Clínica Exemplo Serviços de Saúde Ltda.",
    cnpj: "11.222.333/0001-81",
    rt: { nome: "Dra. Ana Exemplo", conselho: "crm", uf: "SP", numero: "000000" },
  },
  rtCompleto: true,
};
const abrir = (dados: ConfiguracaoDeAssinatura | null = DADOS) => render(<TelaAssinaturas resultado={{ ok: true, data: dados }} />);
const preview = () => screen.getByRole("region", { name: "Preview do ATTA Sign" });

describe("Configurações › Assinaturas & Validade (PDD §10.4.2, captura 46)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sem leitura real (porta vazia), abre no estado vazio do design", () => {
    const { container } = abrir(null);
    expect(estadoDeDados(container)).toBe("vazio");
  });

  it("mostra os 3 modelos do PDD com o marcado, o método ATTA Sign e o preview com os dados do Perfil", () => {
    abrir();
    const opcoes = screen.getAllByRole("radio");
    expect(opcoes).toHaveLength(3);
    expect(screen.getByRole("radio", { name: /RT \+ Profissional Executor/ })).toBeChecked();
    expect(screen.getByRole("region", { name: "Modelo de Assinatura da Clínica" })).toHaveTextContent("Padrão recomendado");
    expect(screen.getByRole("region", { name: "Método de Assinatura Digital" })).toHaveTextContent("ATTA Sign");
    expect(preview()).toHaveTextContent("Clínica Exemplo");
    expect(preview()).toHaveTextContent("CNPJ 11.222.333/0001-81");
    expect(preview()).toHaveTextContent("Dra. Ana Exemplo · CRM-SP 000000");
    expect(preview()).toHaveTextContent("Partes institucionais: RT + Profissional executor");
    expect(preview()).toHaveTextContent("ATTA-XXXX-XXXX-XXXX");
    expect(preview()).not.toHaveTextContent(/exemplo \(payload|est_aurora/i);
  });

  it("o que falta no Perfil aparece como —, nunca inventado", () => {
    abrir({ modelo: null, chancela: { nomeFantasia: "Clínica Exemplo", razaoSocial: null, cnpj: null, rt: null }, rtCompleto: false });
    expect(preview()).toHaveTextContent("— · —");
    expect(preview()).toHaveTextContent("Responsável Técnico: —");
    expect(preview()).toHaveTextContent("Partes institucionais: —");
    expect(screen.getAllByRole("radio").every((r) => !(r as HTMLInputElement).checked)).toBe(true);
  });

  it("escolher outro modelo grava, e o preview acompanha na hora", async () => {
    acoes.salvarModelo.mockResolvedValue({ ok: true, data: { ...DADOS, modelo: "rt_apenas" } });
    abrir();
    await userEvent.click(screen.getByRole("radio", { name: /Apenas Responsável Técnico/ }));
    expect(acoes.salvarModelo).toHaveBeenCalledWith({ modelo: "rt_apenas" });
    await waitFor(() => expect(preview()).toHaveTextContent("Partes institucionais: RT"));
    expect(screen.getByRole("radio", { name: /Apenas Responsável Técnico/ })).toBeChecked();
  });

  it("se o servidor recusar, o modelo volta ao salvo e o motivo aparece", async () => {
    acoes.salvarModelo.mockResolvedValue({ ok: false, error: { code: "SEM_PERMISSAO", message: "x" } });
    abrir();
    await userEvent.click(screen.getByRole("radio", { name: /Profissional do Atendimento/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Só o gestor da clínica muda as Configurações."));
    expect(screen.getByRole("radio", { name: /RT \+ Profissional Executor/ })).toBeChecked();
  });

  it("o hash do preview é um SHA-256 de verdade sobre o payload e muda quando o modelo muda", async () => {
    acoes.salvarModelo.mockResolvedValue({ ok: true, data: { ...DADOS, modelo: "profissional_apenas" } });
    abrir();
    const hash = () => preview().textContent?.match(/[0-9a-f]{64}/)?.[0];
    await waitFor(() => expect(hash()).toBeDefined());
    const antes = hash();
    await userEvent.click(screen.getByRole("radio", { name: /Profissional do Atendimento/ }));
    await waitFor(() => expect(hash()).not.toBe(antes));
    expect(hash()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("sem RT no Perfil, avisa só quando o modelo inclui o RT; salvar continua permitido", async () => {
    const semRt = { ...DADOS, rtCompleto: false, chancela: { ...DADOS.chancela, rt: null } };
    acoes.salvarModelo.mockResolvedValue({ ok: true, data: { ...semRt, modelo: "profissional_apenas" } });
    abrir(semRt);
    expect(screen.getByRole("note")).toHaveTextContent("Falta o Responsável Técnico.");
    await userEvent.click(screen.getByRole("radio", { name: /Profissional do Atendimento/ }));
    expect(acoes.salvarModelo).toHaveBeenCalledWith({ modelo: "profissional_apenas" });
    await waitFor(() => expect(screen.queryByRole("note")).toBeNull());
  });

  it("não há violação do axe", async () => {
    const { container } = abrir();
    expect(await violacoesDoAxe(container)).toEqual([]);
  });
});
