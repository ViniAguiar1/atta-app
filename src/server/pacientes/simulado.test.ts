import { describe, expect, it } from "vitest";
import { isValidCpf } from "@/server/crypto/cpf";
import { PACIENTES_SIMULADOS, criarPortaSimulada } from "./simulado";

describe("porta de Pacientes simulada (MIG-43)", () => {
  it("só CPF gerado com dígito verificador válido e máscara única do servidor", () => {
    for (const p of PACIENTES_SIMULADOS) {
      if (p.cpf) {
        expect(isValidCpf(p.cpf), p.nome).toBe(true);
        expect(p.identificacao).toEqual({ tipo: "cpf", mascarado: `···.···.${p.cpf.slice(6, 9)}-${p.cpf.slice(9)}` });
      } else expect(p.identificacao).toEqual({ tipo: "incompleto" });
    }
  });

  it("lista em ordem de nome, pagina pelo cursor e traz o total", async () => {
    const porta = criarPortaSimulada(PACIENTES_SIMULADOS, 4);
    const p1 = await porta.listar();
    if (!p1.ok) throw new Error("p1");
    expect(p1.data.itens.map((p) => p.nome)).toEqual(["Alana Duarte", "Bruno Teixeira", "Carla Siqueira", "Diana Ferraz"]);
    expect(p1.data.total).toBe(10);
    const p2 = await porta.listar(p1.data.proxima!);
    if (!p2.ok) throw new Error("p2");
    expect(p2.data.itens[0]?.nome).toBe("Eduardo Lima");
    const ultima = await porta.listar(p2.data.proxima!);
    expect(ultima.ok && ultima.data.proxima).toBe(null);
  });

  it("a linha não carrega o CPF em claro nem a origem e o acesso, que ficam na Pasta", async () => {
    const r = await criarPortaSimulada().listar();
    const texto = JSON.stringify(r);
    expect(texto).not.toContain("52998224725");
    expect(texto).not.toMatch(/origem|acessoARede|vinculadoEm/); // o selo entra na linha (simulador); origem e acesso, só na Pasta
  });

  it("busca por CPF inteiro (com ou sem pontuação) ou por parte do nome sem acento; termo curto é VALIDACAO", async () => {
    const porta = criarPortaSimulada();
    const porCpf = await porta.buscar("529.982.247-25");
    expect(porCpf.ok && porCpf.data.map((p) => p.nome)).toEqual(["Juliana Prates"]);
    const porNome = await porta.buscar("iris");
    expect(porNome.ok && porNome.data.map((p) => p.nome)).toEqual(["Íris Nogueira"]);
    expect((await porta.buscar("a")).ok).toBe(false);
    expect((await porta.buscar("5299")).ok).toBe(false);
  });

  it("obter devolve NAO_ENCONTRADO para quem não é da clínica; atualizar exige justificativa", async () => {
    const porta = criarPortaSimulada();
    const fora = await porta.obter("00000000-0000-4000-8000-000000000000");
    expect(fora.ok ? null : fora.error.code).toBe("NAO_ENCONTRADO");
    const id = PACIENTES_SIMULADOS[0]!.id;
    const sem = await porta.atualizar(id, { celular: "(11) 90000-0000" }, "  ");
    expect(sem.ok ? null : sem.error.code).toBe("VALIDACAO");
  });
});
