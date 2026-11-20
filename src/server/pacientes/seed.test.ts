import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CI_TEST_CPF_PEPPER_HEX, CI_TEST_KEYRING } from "../../../tests/fixtures/cofre-ci";
import { MasterKeyCofre, parseKeyring } from "@/server/cofre/master-key";
import { cpfHmacWith, isValidCpf } from "@/server/crypto/cpf";
import { columnAad, open } from "@/server/crypto/envelope";
import { abrirContato, deBytea } from "./contato";

// O seed de pacientes (supabase/seed.sql, MIG-43) foi gerado com a KEK e o pepper de TESTE. Se alguém trocar um deles,
// ou mexer no seed à mão, a lista do e2e para de abrir o contato e a busca por CPF para de achar: este teste avisa antes.
const cofre = new MasterKeyCofre(parseKeyring(CI_TEST_KEYRING));
const pepper = Buffer.from(CI_TEST_CPF_PEPPER_HEX, "hex");

const bloco = readFileSync("supabase/seed.sql", "utf8").split("insert into network.person (")[1]!.split(";")[0]!;
const linhas = [...bloco.matchAll(/^\s+\((.+)\),?$/gm)].map((m) => m[1]!.split(", ").map((v) => v.trim()));
const valor = (v: string) => (v === "null" ? null : v.replace(/^'|'$/g, ""));

describe("seed de pacientes (MIG-43)", () => {
  it("tem os 6 pacientes fictícios, com o trio do CPF completo ou incompleto sem CPF", () => {
    expect(linhas).toHaveLength(6);
    for (const l of linhas) {
      const [, hmac, mascara, enc, , , , , , , , incompleto] = l;
      if (incompleto === "true") expect([hmac, mascara, enc]).toEqual(["null", "null", "null"]);
      else expect(valor(mascara!)).toMatch(/^···\.···\.\d{3}-\d{2}$/);
    }
  });

  it("CPF cifrado abre, é válido e bate com o HMAC do pepper de teste; contato abre pela convenção da ADR 0002 §6", async () => {
    for (const l of linhas) {
      const [idQ, hmac, mascara, enc, , , , phone, email, dek, kek] = l;
      const id = valor(idQ!)!;
      if (dek === "null") continue;
      const blob = { kekVersion: Number(kek), blob: deBytea(valor(dek!)!) };
      const chave = await cofre.unwrapDataKey(blob, { tenant_id: "", table: "network.person", column: "dek", id });
      if (enc !== "null") {
        const cpf = open(deBytea(valor(enc!)!), chave, columnAad("", "network.person", "cpf_enc", id)).toString("utf8");
        expect(isValidCpf(cpf)).toBe(true);
        expect(valor(mascara!)!.endsWith(`${cpf.slice(6, 9)}-${cpf.slice(9)}`)).toBe(true);
        expect(valor(hmac!)).toBe(`\\x${cpfHmacWith(pepper, cpf).toString("hex")}`);
      }
      const contato = await abrirContato(
        { phone_enc: valor(phone!), email_enc: valor(email!), dek_wrapped: valor(dek!), kek_version: Number(kek), envelope_id: id, network_access: "owner" },
        "qualquer-clinica",
        cofre,
      );
      if (contato.celular) expect(contato.celular).toMatch(/^\d{11}$/);
      if (contato.email) expect(contato.email).toMatch(/@exemplo\.test$/);
    }
  });
});
