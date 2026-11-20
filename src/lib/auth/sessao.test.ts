import { describe, expect, it } from "vitest";
import { INATIVIDADE_MAXIMA_S, inicioDoLogin, SESSAO_MAXIMA_S, sessaoVencida } from "./sessao";

const agora = 2_000_000_000;
const login = (s: number) => ({ amr: [{ method: "password", timestamp: agora - s }, { method: "totp", timestamp: agora - 60 }] });
const ativo = (s: number) => String(agora - s);

describe("sessão do painel: 30 min de inatividade e 12 h no máximo", () => {
  it("o login é o mais antigo do amr", () => {
    expect(inicioDoLogin(login(3600))).toBe(agora - 3600);
    expect(inicioDoLogin({ amr: [] })).toBeNull();
    expect(inicioDoLogin({})).toBeNull();
    expect(inicioDoLogin(null)).toBeNull();
  });

  it("dentro dos dois limites, segue", () => {
    expect(sessaoVencida(login(3600), ativo(60), agora)).toBe(false);
    expect(sessaoVencida(login(SESSAO_MAXIMA_S - 60), ativo(INATIVIDADE_MAXIMA_S - 60), agora)).toBe(false);
  });

  it("12 h 1 min desde o login vence, mesmo com atividade recente", () => {
    expect(sessaoVencida(login(SESSAO_MAXIMA_S + 60), ativo(10), agora)).toBe(true);
  });

  it("31 min sem atividade vence", () => {
    expect(sessaoVencida(login(3600), ativo(31 * 60), agora)).toBe(true);
  });

  it("falha fechada: sem cookie, cookie malformado ou sem amr", () => {
    expect(sessaoVencida(login(3600), undefined, agora)).toBe(true);
    expect(sessaoVencida(login(3600), "abc", agora)).toBe(true);
    expect(sessaoVencida({}, ativo(10), agora)).toBe(true);
  });
});
