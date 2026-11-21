import { beforeEach, describe, expect, it, vi } from "vitest";

// Aviso de Privacidade LIGADO (P2b; condição da Segurança): a action aceita só a versão publicada, como literal da
// constante; null, outra versão ou texto livre do navegador são recusados sem chamar a porta. Texto e versão fictícios.
const mocks = vi.hoisted(() => ({ lerHashDoConvite: vi.fn(), enviar: vi.fn() }));
vi.mock("@/server/propass/cookies", () => ({ lerHashDoConvite: mocks.lerHashDoConvite }));
vi.mock("@/server/propass/porta", () => ({ portaPropass: { enviar: mocks.enviar } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "user-agent": "Navegador de teste" }) }));
vi.mock("./aviso-de-privacidade", () => ({
  AVISO_DE_PRIVACIDADE: { versao: "aviso-teste-v1", titulo: "Aviso fictício de teste", paragrafos: ["texto fictício"] },
}));

import { enviarPropass } from "./actions";

const DADOS = { nome: "Bruna Reis", cpf: "529.982.247-25", whatsapp: "(11) 98765-4321", conselho: "crm", numero: "990001", uf: "SP" };
const LEITURA = { abertoEm: "2026-11-21T10:00:00.000Z", rolagemCompletaEm: "2026-11-21T10:01:00.000Z" };
const ENVIO = { dados: DADOS, assinatura: "data:image/png;base64,iVBORw0KGgo=", leuAteOFim: true, pin: "2468", leitura: LEITURA };

describe("enviarPropass com o Aviso de Privacidade ligado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lerHashDoConvite.mockResolvedValue(Buffer.alloc(32, 3));
    mocks.enviar.mockResolvedValue({ ok: true, data: { status: "ok", codigoAtta: "ATTA-7K3M-Q9PX-2HDV" } });
  });

  it("sem a ciência, com outra versão ou com texto livre, recusa sem chamar a porta", async () => {
    for (const avisoDePrivacidade of [null, undefined, "aviso-teste-v0", "aviso-teste-v1 ", "qualquer texto"]) {
      expect(await enviarPropass({ ...ENVIO, avisoDePrivacidade })).toMatchObject({ ok: false, error: { code: "VALIDACAO" } });
    }
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it("com a versão publicada, segue e a versão vai ao servidor", async () => {
    expect(await enviarPropass({ ...ENVIO, avisoDePrivacidade: "aviso-teste-v1" })).toMatchObject({ ok: true, data: { status: "ok" } });
    expect(mocks.enviar.mock.calls[0]![1].avisoDePrivacidade).toBe("aviso-teste-v1");
  });
});
