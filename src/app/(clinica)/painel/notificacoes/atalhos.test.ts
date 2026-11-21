import { describe, expect, it } from "vitest";
import { secaoPorCaminho } from "@/features/configuracoes/secoes";
import { atalhoDeConfiguracoes, destinoDoAtalho } from "./atalhos";

describe("atalhos do sino (MIG-45; ❌ do Tech Lead Frontend no #211)", () => {
  it("módulos de operação abrem para todos", () => {
    expect(destinoDoAtalho("agenda", false, true)).toEqual({ rotulo: "Ir para Agendamentos", href: "/painel/agenda" });
    expect(destinoDoAtalho("documentos", false, true)?.href).toBe("/painel/documentos");
  });

  it("Configurações só para o ADMIN; a seção Equipe só vira atalho quando tem tela", () => {
    expect(destinoDoAtalho("configuracoes", false, true)).toBeNull();
    expect(destinoDoAtalho("configuracoes", true, true)?.href).toBe("/painel/configuracoes");
    // hoje Equipe & Permissões e Notificações estão sem tela (exibir: "nunca"): nada de link para "não encontrado"
    expect(secaoPorCaminho("equipe")?.exibir).toBe("nunca");
    expect(destinoDoAtalho("equipe", true, true)).toBeNull();
    expect(destinoDoAtalho("equipe", true, false)).toBeNull();
    expect(atalhoDeConfiguracoes(true, false)).toBeNull();
    expect(atalhoDeConfiguracoes(false, false)).toBeNull();
  });
});
