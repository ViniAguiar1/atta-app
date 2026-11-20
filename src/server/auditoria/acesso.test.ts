import { beforeEach, describe, expect, it, vi } from "vitest";
import { cabecalhosParaOSupabase } from "@/lib/http/correlacao";

// O evento de acesso leva o IP do usuário e o id da requisição: o registrarAcesso passa os cabeçalhos recebidos ao
// cliente admin, que os transforma nos cabeçalhos do pedido ao Supabase (S2-4 e S3-5).
const rpc = vi.fn(async () => ({ error: null }));
const criarClienteAdmin = vi.fn<(recebidos?: Headers) => { schema: () => { rpc: typeof rpc } }>(() => ({ schema: () => ({ rpc }) }));
vi.mock("@/lib/supabase/admin", () => ({ criarClienteAdmin: (h?: Headers) => criarClienteAdmin(h) }));

const { registrarAcesso } = await import("./acesso");

describe("registrarAcesso", () => {
  beforeEach(() => {
    rpc.mockClear();
    criarClienteAdmin.mockClear();
  });

  it("passa os cabeçalhos da requisição ao cliente admin: o IP e o id seguem para a trilha", async () => {
    const recebidos = new Headers({
      "x-forwarded-for": "198.51.100.4, 10.0.0.1",
      "x-request-id": "11111111-2222-4333-8444-555555555555",
    });
    await registrarAcesso("auth.login_failed", null, { reason: "invalid_credentials" }, recebidos);
    const passado = criarClienteAdmin.mock.calls[0]?.[0];
    expect(passado).toBe(recebidos);
    const enviados = cabecalhosParaOSupabase(passado!, () => "novo", () => true);
    expect(enviados).toEqual({ "x-request-id": "11111111-2222-4333-8444-555555555555", "x-atta-client-ip": "198.51.100.4" });
    expect(rpc).toHaveBeenCalledWith("audit_auth_event", {
      p_action: "auth.login_failed",
      p_user_id: undefined,
      p_details: { reason: "invalid_credentials" },
    });
  });

  it("falha ao gravar não derruba quem chamou", async () => {
    rpc.mockRejectedValueOnce(new Error("fora do ar"));
    await expect(registrarAcesso("auth.logout", "u", {}, new Headers())).resolves.toBeUndefined();
  });
});
