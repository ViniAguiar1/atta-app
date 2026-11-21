import { beforeEach, describe, expect, it } from "vitest";
import { escolherPortaAlertas } from "./porta";
import { reiniciarAlertasSimulados } from "./simulado";

// Escolha da porta e o comportamento da simulada (prévia, local e CI) e da vazia (produção) até o MIG-15.
beforeEach(() => reiniciarAlertasSimulados());

describe("escolherPortaAlertas", () => {
  it("na produção é a vazia: nada para ler e nenhuma escrita aceita (sem dado de mentira)", async () => {
    const porta = escolherPortaAlertas("production");
    expect(await porta.ler()).toEqual({ ok: true, data: null });
    const r = await porta.marcarEvento("checkin_concluido", "email", true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INDISPONIVEL");
  });

  it("fora da produção é a simulada, com os 10 eventos do PDD", async () => {
    const r = await escolherPortaAlertas("preview").ler();
    expect(r.ok && r.data?.eventos).toHaveLength(10);
  });
});

describe("porta simulada", () => {
  const porta = escolherPortaAlertas(undefined);

  it("recusa e-mail e celular fora do formato (reason estável) e só devolve o destino mascarado", async () => {
    const recusado = await porta.alterarCanal("email", "sem-arroba");
    expect(recusado.ok).toBe(false);
    if (!recusado.ok) expect(recusado.error.reason).toBe("ATTA-IN-0001:destino");
    expect((await porta.alterarCanal("whatsapp", "1234")).ok).toBe(false);
    const r = await porta.alterarCanal("whatsapp", "(48) 99876-0001");
    expect(r.ok && r.data.whatsapp.destinoMascarado).toBe("(48) ·····-0001");
    const email = await porta.alterarCanal("email", "recepcao@clinica-exemplo.test");
    expect(email.ok && email.data.email.destinoMascarado).toBe("re·····@clinica-exemplo.test");
  });

  it("canal sem destino não liga (ATTA-IN-0003:address); o destino e o ligado podem ir juntos", async () => {
    const semDestino = await porta.ligarCanal("whatsapp", true);
    expect(!semDestino.ok && semDestino.error.reason).toBe("ATTA-IN-0003:address");
    const junto = await porta.alterarCanal("whatsapp", "(48) 99876-0001", true);
    expect(junto.ok && junto.data.whatsapp).toEqual({ ativo: true, destinoMascarado: "(48) ·····-0001" });
  });

  it("ligar e desligar não mexe no destino; a marcação de um evento fica guardada com o canal desligado", async () => {
    await porta.alterarCanal("whatsapp", "(48) 99876-0001");
    const ligado = await porta.ligarCanal("whatsapp", true);
    expect(ligado.ok && ligado.data.whatsapp).toEqual({ ativo: true, destinoMascarado: "(48) ·····-0001" });
    await porta.ligarCanal("whatsapp", false);
    await porta.marcarEvento("documento_assinado", "whatsapp", true);
    const r = await porta.ler();
    expect(r.ok && r.data?.whatsapp.ativo).toBe(false);
    expect(r.ok && r.data?.eventos.find((e) => e.chave === "documento_assinado")?.whatsapp).toBe(true);
  });
});
