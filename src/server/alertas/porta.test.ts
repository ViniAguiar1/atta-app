import { describe, expect, it } from "vitest";
import { escolherPortaAlertas } from "./porta";

// Escolha da porta e o comportamento da simulada (prévia, local e CI) e da vazia (produção) até o MIG-15.
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
    if (!recusado.ok) expect(recusado.error.reason).toBe("ATTA-IN-0001:address");
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

  it("devolve a marcação com o canal desligado e não guarda nada entre chamadas (sem vazar destino entre sessões)", async () => {
    const r = await porta.marcarEvento("documento_assinado", "whatsapp", true);
    expect(r.ok && r.data.whatsapp.ativo).toBe(false);
    expect(r.ok && r.data.eventos.find((e) => e.chave === "documento_assinado")?.whatsapp).toBe(true);
    await porta.alterarCanal("email", "pessoa@clinica-exemplo.test");
    const depois = await porta.ler();
    expect(depois.ok && depois.data?.email.destinoMascarado).toBe("al·····@clinica-exemplo.test");
    expect(depois.ok && depois.data?.eventos.find((e) => e.chave === "documento_assinado")?.whatsapp).toBe(false);
  });
});
