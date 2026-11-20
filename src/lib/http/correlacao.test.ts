import { isIP } from "node:net";
import { describe, expect, it } from "vitest";
import { cabecalhosParaOSupabase, ipDoCliente, prepararCabecalhosDaRequisicao } from "./correlacao";

const ID = "11111111-2222-4333-8444-555555555555";
const ehIp = (v: string) => isIP(v) !== 0;

describe("correlação e IP do usuário (S2-4)", () => {
  it("o proxy troca o x-request-id do navegador e descarta o x-atta-client-ip dele", () => {
    const h = prepararCabecalhosDaRequisicao(
      new Headers({ "x-request-id": "forjado", "x-atta-client-ip": "203.0.113.9", cookie: "a=1" }),
      ID,
    );
    expect(h.get("x-request-id")).toBe(ID);
    expect(h.get("x-atta-client-ip")).toBeNull();
    expect(h.get("cookie")).toBe("a=1");
  });

  it("ao Supabase vão o id do proxy e o 1º IP do x-forwarded-for", () => {
    const saida = cabecalhosParaOSupabase(new Headers({ "x-request-id": ID, "x-forwarded-for": "198.51.100.4, 10.0.0.1" }), () => "novo", ehIp);
    expect(saida).toEqual({ "x-request-id": ID, "x-atta-client-ip": "198.51.100.4" });
  });

  it("aceita IPv6", () => {
    expect(cabecalhosParaOSupabase(new Headers({ "x-forwarded-for": "2001:db8::1" }), () => ID, ehIp)["x-atta-client-ip"]).toBe("2001:db8::1");
  });

  it("id fora do formato vira novo; IP inválido ou ausente não vai", () => {
    expect(cabecalhosParaOSupabase(new Headers({ "x-request-id": "x", "x-forwarded-for": "nao-ip" }), () => ID, ehIp)).toEqual({ "x-request-id": ID });
    expect(cabecalhosParaOSupabase(new Headers(), () => ID, ehIp)).toEqual({ "x-request-id": ID });
  });

  it("um x-atta-client-ip que chegue ao servidor é ignorado: o IP sai só do x-forwarded-for", () => {
    const saida = cabecalhosParaOSupabase(new Headers({ "x-atta-client-ip": "203.0.113.9" }), () => ID, ehIp);
    expect(saida["x-atta-client-ip"]).toBeUndefined();
  });
  it("ipDoCliente: o 1º do x-forwarded-for, só se for IP; nunca x-real-ip nem x-atta-client-ip do navegador", () => {
    expect(ipDoCliente(new Headers({ "x-forwarded-for": "198.51.100.4, 10.0.0.1" }), ehIp)).toBe("198.51.100.4");
    expect(ipDoCliente(new Headers({ "x-forwarded-for": "2001:db8::1" }), ehIp)).toBe("2001:db8::1");
    expect(ipDoCliente(new Headers({ "x-forwarded-for": "nao-ip" }), ehIp)).toBeNull();
    expect(ipDoCliente(new Headers({ "x-real-ip": "203.0.113.1", "x-atta-client-ip": "203.0.113.9" }), ehIp)).toBeNull();
    expect(ipDoCliente(new Headers(), ehIp)).toBeNull();
  });
});
