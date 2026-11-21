import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { falha, ok } from "@/lib/errors";
import type { AgendamentoDaPasta, AgendamentosDaPasta as Pagina, FichaDoPaciente } from "@/server/pacientes/porta";
import { violacoesDoAxe } from "@/components/ui/axe-de-teste";
import { AgendamentosDaPasta } from "./AgendamentosDaPasta";
import { PastaDoPaciente } from "./PastaDoPaciente";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// Paciente e profissional fictícios; datas em UTC, mostradas no fuso da clínica.
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PESSOA = uid(301);
const agendamento = (n: number, mais: Partial<AgendamentoDaPasta> = {}): AgendamentoDaPasta => ({
  id: uid(n),
  inicio: "2026-11-19T14:30:00+00:00", // 11:30 em São Paulo
  duracaoMin: 60,
  tipo: "procedimento",
  modalidade: "presencial",
  paciente: { tipo: "pessoa", id: PESSOA, nomeExibicao: "Carla Siqueira", cpfMascarado: "···.···.066-11", iniciais: "CS" },
  servicos: [{ id: uid(101), nome: "Peeling químico médio" }],
  profissional: { vinculoId: uid(901), nomeExibicao: "Dr. Caio Andrade" },
  documentos: [],
  status: "em_atendimento",
  atrasado: false,
  confirmacao: "confirmado",
  boardingCheckEnviadoEm: null,
  acoes: [],
  marcos: { checkin: "2026-11-19T14:20:00+00:00", pronto: "2026-11-19T14:24:00+00:00", emAtendimento: "2026-11-19T14:35:00+00:00", concluido: null },
  pendencia: { tipo: "termo_nao_assinado", obrigatoria: true },
  termos: 2,
  docsClinicos: 0,
  ...mais,
});
const pagina = (mais: Partial<Pagina> = {}): Pagina => ({
  itens: [agendamento(1), agendamento(2, { inicio: "2026-11-20T17:00:00+00:00", status: "agendado", marcos: { checkin: null, pronto: null, emAtendimento: null, concluido: null }, pendencia: null, termos: 1 })],
  totais: { agendamentos: 2, termosAssinados: 0, docsClinicos: 0, pendencias: 1 },
  hoje: { quantidade: 1, ultimoEm: "2026-11-21T17:00:00+00:00" },
  proximo: null,
  fuso: "America/Sao_Paulo",
  ...mais,
});

describe("Agendamentos e documentos da Pasta (capturas 13 e 14)", () => {
  it("cada linha: data e hora no fuso da clínica, procedimento, profissional, status, marcos, pendência e contagens", () => {
    render(<AgendamentosDaPasta id={PESSOA} inicial={pagina()} mais={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "Agendamentos (2)" })).toHaveAttribute("aria-selected", "true");
    const [primeira, segunda] = within(screen.getByRole("tabpanel")).getAllByRole("listitem");
    expect(primeira).toHaveTextContent("19/11/2026");
    expect(primeira).toHaveTextContent("11:30");
    expect(primeira).toHaveTextContent("Peeling químico médio");
    expect(primeira).toHaveTextContent("Dr. Caio Andrade");
    expect(primeira).toHaveTextContent("Em atendimento");
    expect(primeira).toHaveTextContent("Check-in 11:20 · Pronto 11:24 · Em atendimento 11:35");
    expect(primeira).toHaveTextContent("Pendência a regularizar");
    expect(primeira).toHaveTextContent("Pendência obrigatória");
    expect(primeira).toHaveTextContent("2 termo(s) · 0 doc(s) clínico(s)");
    expect(segunda).toHaveTextContent("Sem marcos ainda");
    expect(segunda).not.toHaveTextContent("Pendência");
  });

  it("aba Pendências pelo teclado: o cartão do termo não assinado com o Como resolver; vazio sem pendência", async () => {
    render(<AgendamentosDaPasta id={PESSOA} inicial={pagina()} mais={vi.fn()} />);
    screen.getByRole("tab", { name: "Agendamentos (2)" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    const aba = screen.getByRole("tab", { name: "Pendências (1)" });
    expect(aba).toHaveFocus();
    expect(aba).toHaveAttribute("aria-selected", "true");
    const painel = screen.getByRole("tabpanel");
    expect(within(painel).getAllByRole("listitem")).toHaveLength(1);
    expect(painel).toHaveTextContent("Termo não assinado");
    expect(painel).toHaveTextContent("Peeling químico médio · 19/11/2026 às 11:30 · Dr. Caio Andrade");
    expect(painel).toHaveTextContent("Ninguém assina pelo paciente.");
  });

  it("Carregar mais pede a página seguinte pelo cursor e junta as linhas; erro mostra o tentar de novo", async () => {
    const mais = vi
      .fn()
      .mockResolvedValueOnce(falha("INDISPONIVEL", "fora"))
      .mockResolvedValueOnce(ok(pagina({ itens: [agendamento(3, { pendencia: null })], proximo: null })));
    render(<AgendamentosDaPasta id={PESSOA} inicial={pagina({ proximo: "2026-11-19T14:30:00.000000Z|" + uid(2) })} mais={mais} />);
    await userEvent.click(screen.getByRole("button", { name: "Carregar mais agendamentos" }));
    expect(mais).toHaveBeenCalledWith({ id: PESSOA, cursor: "2026-11-19T14:30:00.000000Z|" + uid(2) });
    expect(await screen.findByText("INDISPONIVEL")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Carregar mais agendamentos" }));
    expect(await within(screen.getByRole("tabpanel")).findAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Carregar mais agendamentos" })).toBeNull();
  });

  it("passa no axe", async () => {
    const { container } = render(<AgendamentosDaPasta id={PESSOA} inicial={pagina()} mais={vi.fn()} />);
    expect(await violacoesDoAxe(container)).toEqual([]);
  });
});

describe("Pasta com os agendamentos: resumo e permissão", () => {
  const ficha: FichaDoPaciente = {
    id: PESSOA,
    nome: "Carla Siqueira",
    nomeCivil: "Carla Siqueira",
    nomeSocial: null,
    nascimento: "1982-01-30",
    identificacao: { tipo: "cpf", mascarado: "···.···.066-11" },
    contato: null,
    selo: null,
    seloExpirouEm: null,
    arquivadoEm: null,
    origem: "recepcao",
    vinculadoEm: "2026-05-05T12:00:00Z",
    acessoARede: "proprio",
  };
  const resumo = () => screen.getByRole("complementary", { name: "Resumo do paciente" });
  const item = (rotulo: string) => within(resumo()).getByText(rotulo).nextElementSibling;

  it("o resumo usa os totais: atendimentos de hoje com o último horário, termos assinados e pendências", () => {
    render(<PastaDoPaciente ficha={ficha} agendamentos={ok(pagina())} mais={vi.fn()} />);
    expect(item("Atendimentos hoje")).toHaveTextContent("1 · último às 14:00");
    expect(item("Termos assinados")).toHaveTextContent("0");
    expect(item("Pendências")).toHaveTextContent("1 a regularizar");
    expect(screen.getByRole("region", { name: "Agendamentos e documentos" })).toBeInTheDocument();
  });

  it("sem appointments.view a seção não aparece e o resumo fica em —; outro erro mostra o tentar de novo", () => {
    const { unmount } = render(<PastaDoPaciente ficha={ficha} agendamentos={falha("SEM_PERMISSAO", "x")} mais={vi.fn()} />);
    expect(screen.queryByRole("region", { name: "Agendamentos e documentos" })).toBeNull();
    expect(item("Atendimentos hoje")).toHaveTextContent("—");
    expect(screen.queryByRole("button", { name: /tentar/i })).toBeNull();
    unmount();
    render(<PastaDoPaciente ficha={ficha} agendamentos={falha("INDISPONIVEL", "x")} mais={vi.fn()} />);
    expect(screen.getByRole("button", { name: /tentar/i })).toBeInTheDocument();
  });
});
