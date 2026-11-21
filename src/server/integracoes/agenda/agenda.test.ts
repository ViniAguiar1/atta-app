import { describe, expect, it } from "vitest";
import { gerarPkce, urlAutorizacaoGoogle, urlAutorizacaoMicrosoft } from "./oauth";
import type { EventoOcupado } from "./porta";
import { planejarSincronizacao, proximaSincronizacao } from "./sincronizacao";
import { SimuladorAgenda } from "./simulador";

const AGORA = new Date("2026-11-21T12:00:00Z");
const ev = (id: string, versao: string, extra: Partial<EventoOcupado> = {}): EventoOcupado => ({
  idExterno: id,
  versao,
  inicio: new Date("2026-11-22T13:00:00Z"),
  fim: new Date("2026-11-22T14:00:00Z"),
  diaInteiro: false,
  removido: false,
  ...extra,
});

describe("OAuth da agenda (PKCE S256, só leitura)", () => {
  it("o desafio é o SHA-256 do verificador, em base64url", () => {
    const { verifier, challenge } = gerarPkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(gerarPkce().verifier).not.toBe(verifier);
  });

  it("Google: escopos só de leitura, state, PKCE e refresh (offline)", () => {
    const u = new URL(
      urlAutorizacaoGoogle("cliente-teste", {
        state: "s1",
        codeChallenge: "c".repeat(43),
        redirectUri: "http://localhost:3004/api/integracoes/agenda/google/retorno",
      }),
    );
    expect(u.origin).toBe("https://accounts.google.com");
    expect(
      u.searchParams
        .get("scope")
        ?.split(" ")
        .every((s) => s.endsWith(".readonly")),
    ).toBe(true);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("state")).toBe("s1");
  });

  it("Microsoft: Calendars.ReadBasic e offline_access, sem escrita", () => {
    const u = new URL(
      urlAutorizacaoMicrosoft("cliente-teste", {
        state: "s2",
        codeChallenge: "c".repeat(43),
        redirectUri: "http://localhost:3004/api/integracoes/agenda/microsoft/retorno",
      }),
    );
    expect(u.searchParams.get("scope")?.split(" ").sort()).toEqual(["Calendars.ReadBasic", "offline_access"]);
    expect(u.searchParams.get("scope")).not.toMatch(/ReadWrite/);
  });
});

describe("simulador da agenda", () => {
  it("conecta pelo OAuth fictício e lê a carga inicial e o incremental", async () => {
    const ag = new SimuladorAgenda("google", () => AGORA);
    const retorno = new URL(
      ag.urlAutorizacao({ state: "s", codeChallenge: "c", redirectUri: "http://localhost/retorno" }),
    );
    const tokens = await ag.trocarCodigo({ code: retorno.searchParams.get("code")!, codeVerifier: "v".repeat(43) });
    expect(tokens.ok).toBe(true);
    ag.registrar(ev("a", "1"));
    ag.registrar(ev("b", "1"));
    const janela = { accessToken: "x", agendaId: "principal", de: AGORA, ate: new Date("2027-02-19T00:00:00Z") };
    const inicial = await ag.listarOcupados(janela);
    if (!inicial.ok) throw new Error();
    expect(inicial.valor.eventos.map((e) => e.idExterno)).toEqual(["a", "b"]);
    ag.registrar(ev("a", "2"));
    const inc = await ag.listarOcupados({ ...janela, cursor: inicial.valor.cursor });
    expect(inc.ok && inc.valor.eventos.map((e) => `${e.idExterno}@${e.versao}`)).toEqual(["a@2"]);
  });

  it("código errado e conexão revogada falham sem segredo na mensagem", async () => {
    const ag = new SimuladorAgenda("microsoft", () => AGORA);
    const r = await ag.trocarCodigo({ code: "outro", codeVerifier: "v".repeat(43) });
    expect(!r.ok && r.falha.tipo).toBe("permanente");
    await ag.revogar("sim_refresh");
    const renov = await ag.renovar("sim_refresh");
    expect(!renov.ok && renov.falha).toMatchObject({ tipo: "configuracao", codigo: "token_revogado" });
  });
});

describe("sincronização (PDD §10.4.5)", () => {
  it("frequência 15 min, 30 min, 1 h ou manual", () => {
    const ultima = new Date("2026-11-21T11:00:00Z");
    expect(proximaSincronizacao(ultima, "15min", AGORA)?.toISOString()).toBe("2026-11-21T11:15:00.000Z");
    expect(proximaSincronizacao(ultima, "1h", AGORA)?.toISOString()).toBe("2026-11-21T12:00:00.000Z");
    expect(proximaSincronizacao(null, "30min", AGORA)).toBe(AGORA);
    expect(proximaSincronizacao(ultima, "manual", AGORA)).toBeNull();
  });

  it("separa novos, alterados e removidos pela versão; dia inteiro não ocupa horário", () => {
    const trazidos = new Map([
      ["igual", "1"],
      ["mudou", "1"],
      ["sumiu", "1"],
      ["virou-dia-inteiro", "1"],
    ]);
    const plano = planejarSincronizacao(
      [
        ev("igual", "1"),
        ev("mudou", "2"),
        ev("sumiu", "2", { removido: true }),
        ev("virou-dia-inteiro", "2", { diaInteiro: true }),
        ev("novo", "1"),
        ev("feriado", "1", { diaInteiro: true }),
      ],
      trazidos,
    );
    expect(plano.novos.map((e) => e.idExterno)).toEqual(["novo"]);
    expect(plano.alterados.map((e) => e.idExterno)).toEqual(["mudou"]);
    expect(plano.removidos).toEqual(["sumiu", "virou-dia-inteiro"]);
  });
});
