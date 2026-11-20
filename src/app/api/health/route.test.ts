import { describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
}));

const { GET } = await import("./route");

describe("GET /api/health", () => {
  it("responde ok, sem cache e sem nenhum segredo", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_ficticia_de_teste");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "0123456789abcdef0123");
    const resposta = await GET();
    const corpo = await resposta.json();
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    expect(corpo).toMatchObject({ status: "ok", service: "atta-app", commit: "0123456789ab" });
    expect(JSON.stringify(corpo)).not.toContain("sb_secret");
    vi.unstubAllEnvs();
  });
});
