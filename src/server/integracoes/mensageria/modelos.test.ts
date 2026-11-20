import { describe, expect, it } from "vitest";
import { MODELOS, modeloEhEssencial, renderizar } from "./modelos";

// Só dados fictícios: telefone de teste, clínica inventada.
const opcoes = { hostsPermitidos: ["attahub.com.br"] };
const linkCheckin = {
  canal: "whatsapp" as const,
  finalidade: "link_checkin" as const,
  modelo: "link_checkin",
  destinatario: { tipo: "telefone" as const, endereco: "+5511912340001" },
  chaveIdempotencia: "k1",
};
const variaveis = { nome_clinica: "Clínica Fictícia Aurora", data_hora: "20/11 às 15:00" };

describe("catálogo de modelos", () => {
  it("monta o WhatsApp com o modelo aprovado e os parâmetros em ordem", () => {
    const r = renderizar(
      { ...linkCheckin, variaveis: { ...variaveis, link: "https://checkin.attahub.com.br/c/Ab3dE" } },
      opcoes,
    );
    expect(r.ok && r.valor.whatsapp).toEqual({
      modelo: "atta_link_checkin",
      idioma: "pt_BR",
      categoria: "utility",
      parametros: ["Clínica Fictícia Aurora", "20/11 às 15:00", "https://checkin.attahub.com.br/c/Ab3dE"],
    });
  });

  it("o código vai também no botão de copiar (modelo de autenticação)", () => {
    const r = renderizar(
      {
        ...linkCheckin,
        finalidade: "codigo_verificacao",
        modelo: "codigo_verificacao",
        variaveis: { codigo: "482913" },
      },
      opcoes,
    );
    expect(r.ok && r.valor.whatsapp).toMatchObject({
      categoria: "authentication",
      parametros: ["482913"],
      codigoNoBotao: "482913",
    });
  });

  it("SMS e e-mail saem em texto, com o HTML escapado", () => {
    const sms = renderizar(
      {
        ...linkCheckin,
        canal: "sms",
        finalidade: "codigo_verificacao",
        modelo: "codigo_verificacao",
        variaveis: { codigo: "482913" },
      },
      opcoes,
    );
    expect(sms.ok && sms.valor.texto).toBe(
      "ATTA: seu código de check-in é 482913. Vale por 10 minutos. Não compartilhe.",
    );
    const email = renderizar(
      {
        canal: "email",
        finalidade: "convite_equipe",
        modelo: "convite_equipe",
        destinatario: { tipo: "email", endereco: "colaborador@clinica-ficticia.test" },
        chaveIdempotencia: "k2",
        variaveis: { nome_clinica: "Clínica A & B", link: "https://painel.attahub.com.br/convite/Zx9" },
      },
      opcoes,
    );
    expect(email.ok && email.valor.assunto).toBe("Convite para a equipe de Clínica A & B no ATTA");
    expect(email.ok && email.valor.html).toContain("Clínica A &amp; B");
  });

  it("variável fora do modelo nunca sai: é por onde dado de saúde vazaria (RN-NOT-01)", () => {
    const r = renderizar(
      {
        ...linkCheckin,
        variaveis: { ...variaveis, link: "https://checkin.attahub.com.br/c/Ab3dE", procedimento: "Toxina" },
      },
      opcoes,
    );
    expect(!r.ok && r.falha).toMatchObject({ tipo: "permanente", codigo: "variavel_nao_permitida" });
  });

  it("link só do ATTA e sem dado na URL (RN-AGN-CONV-04)", () => {
    for (const link of [
      "https://golpe.example/c/Ab3dE",
      "https://checkin.attahub.com.br/c?cpf=52998224725",
      "http://checkin.attahub.com.br/c/Ab3dE",
      "https://usuario@checkin.attahub.com.br/c/Ab3dE",
    ]) {
      const r = renderizar({ ...linkCheckin, variaveis: { ...variaveis, link } }, opcoes);
      expect(r.ok, link).toBe(false);
    }
  });

  it("recusa modelo, canal, destinatário ou finalidade que não combinam", () => {
    const casos = [
      { ...linkCheckin, modelo: "texto_livre" },
      { ...linkCheckin, canal: "email" as const },
      { ...linkCheckin, destinatario: { tipo: "email" as const, endereco: "a@b.test" } },
      { ...linkCheckin, finalidade: "lembrete_checkin" as const },
    ];
    for (const c of casos)
      expect(
        renderizar({ ...c, variaveis: { ...variaveis, link: "https://checkin.attahub.com.br/c/Ab3dE" } }, opcoes).ok,
      ).toBe(false);
  });

  it("nome da clínica não carrega link nem quebra de linha", () => {
    for (const nome_clinica of ["Veja https://x.test", "Linha\nnova", "X"]) {
      expect(
        renderizar(
          { ...linkCheckin, variaveis: { ...variaveis, nome_clinica, link: "https://checkin.attahub.com.br/c/A" } },
          opcoes,
        ).ok,
      ).toBe(false);
    }
  });

  it("todo modelo do paciente é essencial (RN-NOT-02); alerta da equipe não", () => {
    for (const id of ["codigo_verificacao", "link_checkin", "lembrete_checkin", "link_termos"])
      expect(modeloEhEssencial(id)).toBe(true);
    expect(modeloEhEssencial("alerta_equipe")).toBe(false);
    expect(Object.values(MODELOS).every((m) => !("whatsapp" in m) || m.whatsapp.modelo.startsWith("atta_"))).toBe(true);
  });
});
