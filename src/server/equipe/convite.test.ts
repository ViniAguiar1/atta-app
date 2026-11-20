// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { convidarMembro } = await import("./convite");
const { conviteSchema } = await import("@/features/equipe/schema");
const { LIMITES } = await import("@/server/limite");

// Só dados fictícios. Os clientes são dublês: o que importa é a ordem, o que vai para cada um e o que volta à tela.
const GESTOR = "a1a1a1a1-0000-4000-8000-0000000000a1";
const CLINICA = "aaaaaaaa-0000-4000-8000-000000000001";
const ADMIN = { sub: GESTOR, app_role: "ADMIN", aal: "aal2", tenant_id: CLINICA };
const USUARIO = "01010101-0000-4000-8000-000000000001";
const VINCULO = "11111111-0000-4000-8000-0000000000c9";

function clientes(o: {
  claims?: Record<string, unknown> | null;
  vinculoDoGestor?: { app_role: string; status: string } | null;
  limite?: (bucket: string) => boolean;
  convite?: { data: unknown; error: unknown };
  rpc?: { data: unknown; error: unknown };
}) {
  const inviteUserByEmail = vi.fn().mockResolvedValue(o.convite ?? { data: { user: { id: USUARIO } }, error: null });
  const updateUserById = vi.fn().mockResolvedValue({ data: {}, error: null });
  const deleteUser = vi.fn().mockResolvedValue({ data: {}, error: null });
  const rpc = vi.fn().mockResolvedValue(o.rpc ?? { data: VINCULO, error: null });
  const consulta = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: o.vinculoDoGestor === undefined ? { app_role: "ADMIN", status: "active" } : o.vinculoDoGestor,
      error: null,
    }),
  };
  const from = vi.fn().mockReturnValue(consulta);
  const servidor = {
    auth: { getClaims: vi.fn().mockResolvedValue({ data: o.claims === null ? null : { claims: o.claims ?? ADMIN } }) },
    schema: vi.fn((nome: string) => (nome === "platform" ? { from } : { rpc })),
  };
  const admin = { auth: { admin: { inviteUserByEmail, updateUserById, deleteUser } } };
  const limitar = vi.fn(async (p: { bucket: string }) =>
    (o.limite ?? (() => true))(p.bucket)
      ? ({ ok: true, data: null } as const)
      : ({ ok: false, error: { code: "LIMITE", message: "Muitas tentativas." } } as const),
  );
  return { servidor, admin, limitar, inviteUserByEmail, updateUserById, deleteUser, rpc, from, consulta };
}

const colaborador = conviteSchema.parse({ email: " Recepcao.Ficticia@Exemplo.test ", papel: "COLABORADOR" });

describe("convite de Equipe & Permissões (PDD §10.4.3)", () => {
  it("convida: confere o vínculo, conta o limite, cria no Auth, vincula pela sessão do gestor e marca o vínculo", async () => {
    const c = clientes({});
    const r = await convidarMembro(colaborador, c as never);
    expect(r).toEqual({ ok: true, data: { vinculo: VINCULO } });
    expect(c.from).toHaveBeenCalledWith("membership");
    expect(c.consulta.eq).toHaveBeenCalledWith("user_id", GESTOR);
    expect(c.consulta.eq).toHaveBeenCalledWith("tenant_id", CLINICA);
    expect(c.limitar).toHaveBeenCalledWith(LIMITES.conviteEquipePorUsuario, GESTOR);
    expect(c.limitar).toHaveBeenCalledWith(LIMITES.conviteEquipePorClinica, CLINICA);
    expect(c.inviteUserByEmail).toHaveBeenCalledWith("recepcao.ficticia@exemplo.test", { data: {} });
    expect(c.rpc).toHaveBeenCalledWith("team_invite", { p_user_id: USUARIO, p_app_role: "COLABORADOR" });
    expect(c.updateUserById).toHaveBeenCalledWith(USUARIO, { app_metadata: { atta_convite: VINCULO } });
    expect(c.deleteUser).not.toHaveBeenCalled();
  });

  it("leva a matriz do COLABORADOR e o nome do convidado", async () => {
    const c = clientes({});
    const convite = conviteSchema.parse({
      email: "recepcao@exemplo.test",
      nome: "Pessoa Ficticia",
      papel: "COLABORADOR",
      permissoes: { documents: ["view"] },
    });
    await convidarMembro(convite, c as never);
    expect(c.inviteUserByEmail).toHaveBeenCalledWith("recepcao@exemplo.test", { data: { full_name: "Pessoa Ficticia" } });
    expect(c.rpc).toHaveBeenCalledWith("team_invite", {
      p_user_id: USUARIO,
      p_app_role: "COLABORADOR",
      p_permissions: { documents: ["view"] },
    });
  });

  it("sem sessão, ou sem ADMIN com 2º fator e clínica no token, nem chega à secret key", async () => {
    for (const claims of [null, { ...ADMIN, aal: "aal1" }, { ...ADMIN, app_role: "COLABORADOR" }, { ...ADMIN, tenant_id: undefined }]) {
      const c = clientes({ claims });
      const r = await convidarMembro(colaborador, c as never);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(["NAO_AUTENTICADO", "SEM_PERMISSAO"]).toContain(r.error.code);
      expect(c.inviteUserByEmail).not.toHaveBeenCalled();
    }
  });

  it("ADMIN suspenso ou removido com token ainda válido: SEM_PERMISSAO, sem secret key (o banco não mostra o vínculo)", async () => {
    for (const vinculoDoGestor of [null, { app_role: "COLABORADOR", status: "active" }]) {
      const c = clientes({ vinculoDoGestor });
      const r = await convidarMembro(colaborador, c as never);
      expect(r).toMatchObject({ ok: false, error: { code: "SEM_PERMISSAO" } });
      expect(c.limitar).not.toHaveBeenCalled();
      expect(c.inviteUserByEmail).not.toHaveBeenCalled();
    }
  });

  it("passou do limite (por gestor ou por clínica): LIMITE, sem criar conta", async () => {
    for (const bucket of [LIMITES.conviteEquipePorUsuario.bucket, LIMITES.conviteEquipePorClinica.bucket]) {
      const c = clientes({ limite: (b) => b !== bucket });
      const r = await convidarMembro(colaborador, c as never);
      expect(r).toMatchObject({ ok: false, error: { code: "LIMITE" } });
      expect(c.inviteUserByEmail).not.toHaveBeenCalled();
    }
  });

  it("conta que já existe é conflito, sem vínculo", async () => {
    const c = clientes({ convite: { data: { user: null }, error: { code: "email_exists" } } });
    const r = await convidarMembro(colaborador, c as never);
    expect(r).toMatchObject({ ok: false, error: { code: "CONFLITO", reason: "ATTA-IN-0003:not_invited" } });
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it("recusa do banco (3º gestor): CONFLITO com o motivo, apaga a conta recém-criada e não marca nada", async () => {
    const c = clientes({ rpc: { data: null, error: { code: "P0001", message: "ATTA-IN-0003", details: "admin_limit" } } });
    const gestor = conviteSchema.parse({ email: "gestor@exemplo.test", papel: "ADMIN" });
    const r = await convidarMembro(gestor, c as never);
    expect(r).toMatchObject({ ok: false, error: { code: "CONFLITO", reason: "ATTA-IN-0003:admin_limit" } });
    expect(c.deleteUser).toHaveBeenCalledWith(USUARIO);
    expect(c.updateUserById).not.toHaveBeenCalled();
  });

  it("falha do Auth vira INDISPONIVEL, sem ecoar o e-mail", async () => {
    const c = clientes({ convite: { data: { user: null }, error: { code: "over_email_send_rate_limit" } } });
    const r = await convidarMembro(colaborador, c as never);
    expect(r).toMatchObject({ ok: false, error: { code: "INDISPONIVEL" } });
    expect(JSON.stringify(r)).not.toContain("exemplo.test");
  });
});

describe("borda do convite", () => {
  it("ADMIN não leva matriz; módulo fora da lista e e-mail inválido são recusados", () => {
    expect(conviteSchema.safeParse({ email: "a@exemplo.test", papel: "ADMIN", permissoes: { atta: ["view"] } }).success).toBe(false);
    expect(conviteSchema.safeParse({ email: "a@exemplo.test", papel: "COLABORADOR", permissoes: { settings: ["view"] } }).success).toBe(false);
    expect(conviteSchema.safeParse({ email: "nao-e-email", papel: "COLABORADOR" }).success).toBe(false);
    expect(conviteSchema.safeParse({ email: "a@exemplo.test", papel: "PROFISSIONAL" }).success).toBe(false);
  });
});
