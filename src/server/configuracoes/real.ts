import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { falha, falhaDoBanco, ok, type Resultado } from "@/lib/errors";
import { criarClienteServidor } from "@/lib/supabase/server";
import { getCofre } from "@/server/cofre";
import { MASK_CHAR } from "@/server/crypto/cpf";
import { columnAad, seal } from "@/server/crypto/envelope";
import type { CelularDoFluxo, ChaveDeParametro, Parametro, PortaConfiguracoes } from "./porta";

// Porta real de Configurações sobre o MIG-10b (#57, Backend 2): atta_in.settings_screen, atta_in.set_setting e
// atta_in.alt_flow_phone, sempre com o cliente de servidor e a sessão do usuário (nunca a secret key). Quem confere papel,
// limite, regra cruzada e o teto de 10 celulares é o banco (RLS e funções); erro do banco sai por falhaDoBanco, com o reason.
// O número do celular é cifrado aqui (ADR 0002: DEK por registro pelo Cofre 'network', valor no formato 1 com key_version
// 1 e AAD tenant_id|atta_in.alt_flow_phone|phone_enc|id); o painel só lê a máscara.

const CHAVES: readonly ChaveDeParametro[] = [
  "link_envio_antecedencia_h",
  "link_validade_apos_h",
  "lembrete_1_min",
  "lembrete_2_min",
  "janela_de_confirmacao_h",
  "tolerancia_da_ausencia_min",
  "fluxo_alternativo_habilitado",
];
const ORIGENS = ["sistema", "unidade", "tipo_de_atendimento", "servico"] as const;

// borda: a resposta do banco passa pelo Zod antes de virar Parametro; chave que a tela não conhece é ignorada
const linhaSchema = z.object({
  key: z.string(),
  value_type: z.enum(["int", "bool"]),
  value_int: z.number().int().nullable(),
  value_bool: z.boolean().nullable(),
  source: z.enum(ORIGENS),
  default_int: z.number().int().nullable(),
  default_bool: z.boolean().nullable(),
  min_int: z.number().int().nullable(),
  max_int: z.number().int().nullable(),
  allowed_ints: z.array(z.number().int()).nullable(),
});

function paraParametro(linha: z.infer<typeof linhaSchema>): Parametro | null {
  if (!CHAVES.includes(linha.key as ChaveDeParametro)) return null;
  const chave = linha.key as ChaveDeParametro;
  if (linha.value_type === "bool") {
    if (linha.value_bool === null || linha.default_bool === null) return null;
    return { chave, tipo: "bool", valor: linha.value_bool, padrao: linha.default_bool, origem: linha.source };
  }
  if (linha.value_int === null || linha.default_int === null) return null;
  return {
    chave,
    tipo: "int",
    valor: linha.value_int,
    padrao: linha.default_int,
    origem: linha.source,
    min: linha.min_int,
    max: linha.max_int,
    permitidos: linha.allowed_ints,
  };
}

async function lerParametros(): Promise<Resultado<Parametro[]>> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.schema("atta_in").rpc("settings_screen", {});
  if (error) return falhaDoBanco(error);
  const linhas = z.array(linhaSchema).safeParse(data);
  if (!linhas.success) return falha("INTERNO", "Resposta inesperada do banco.");
  return ok(linhas.data.map(paraParametro).filter((p): p is Parametro => p !== null));
}

const celularSchema = z.object({ id: z.uuid(), label: z.string(), phone_masked: z.string() });
const paraCelular = (c: z.infer<typeof celularSchema>): CelularDoFluxo => ({ id: c.id, nome: c.label, numeroMascarado: c.phone_masked });

/** Máscara do celular gravada na linha: DDD e os 4 últimos, com o ponto médio da máscara única (ADR 0002 §6). */
export const mascararCelular = (d: string) => `(${d.slice(0, 2)}) ${MASK_CHAR.repeat(5)}-${d.slice(7)}`;
const hex = (b: Uint8Array) => `\\x${Buffer.from(b).toString("hex")}`; // bytea pelo PostgREST

export const portaConfiguracoesReal: PortaConfiguracoes = {
  parametros: lerParametros,

  async salvarParametro(chave, valor) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.schema("atta_in").rpc("set_setting", { p_key: chave, p_value: valor });
    if (error) return falhaDoBanco(error);
    // o set_setting devolve só key, value e level: relê a chave para devolver o Parametro completo (Backend 2)
    const todos = await lerParametros();
    if (!todos.ok) return todos;
    const salvo = todos.data.find((p) => p.chave === chave);
    return salvo ? ok(salvo) : falha("NAO_ENCONTRADO", "Parâmetro inexistente.");
  },

  async celulares() {
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.schema("atta_in").from("alt_flow_phone").select("id, label, phone_masked").order("created_at");
    if (error) return falhaDoBanco(error);
    const lista = z.array(celularSchema).safeParse(data);
    return lista.success ? ok(lista.data.map(paraCelular)) : falha("INTERNO", "Resposta inesperada do banco.");
  },

  async adicionarCelular(nome, numero) {
    const rotulo = nome.trim();
    const digitos = numero.replace(/\D/g, "");
    const campos = [
      ...(rotulo.length < 1 || rotulo.length > 40 ? [{ campo: "nome", code: "VALIDACAO" as const }] : []), // R14
      ...(!/^[1-9]{2}9\d{8}$/.test(digitos) ? [{ campo: "numero", code: "VALIDACAO" as const }] : []), // §16.6
    ];
    if (campos.length) return falha("VALIDACAO", "Confira os campos.", campos);

    const supabase = await criarClienteServidor();
    const { data: sessao } = await supabase.auth.getClaims();
    const tenant = sessao?.claims?.tenant_id;
    if (typeof tenant !== "string") return falha("NAO_AUTENTICADO", "Sem clínica na sessão.");

    const id = randomUUID();
    const contexto = { tenant_id: tenant, table: "atta_in.alt_flow_phone", column: "phone_enc", id };
    const { plaintext, wrapped } = await getCofre("network").generateDataKey(contexto);
    let cifrado: Buffer;
    try {
      cifrado = seal(Buffer.from(digitos, "utf8"), plaintext, columnAad(tenant, contexto.table, contexto.column, id), 1);
    } finally {
      plaintext.fill(0); // a DEK em claro não sobrevive à chamada
    }

    const { data, error } = await supabase
      .schema("atta_in")
      .from("alt_flow_phone")
      .insert({
        id,
        tenant_id: tenant,
        label: rotulo,
        phone_masked: mascararCelular(digitos),
        phone_enc: hex(cifrado),
        dek_wrapped: hex(wrapped.blob),
        kek_version: wrapped.kekVersion,
      })
      .select("id, label, phone_masked")
      .single();
    if (error) {
      const r = falhaDoBanco(error);
      // o teto de 10 celulares é a regra ATTA-IN-0003:alt_flow_phone; para a tela, é LIMITE (R14)
      if (!r.ok && r.error.reason === "ATTA-IN-0003:alt_flow_phone") return falha("LIMITE", "Até 10 celulares.", undefined, r.error.reason);
      return r;
    }
    const salvo = celularSchema.safeParse(data);
    return salvo.success ? ok(paraCelular(salvo.data)) : falha("INTERNO", "Resposta inesperada do banco.");
  },

  async removerCelular(id) {
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.schema("atta_in").from("alt_flow_phone").delete().eq("id", id).select("id");
    if (error) return falhaDoBanco(error);
    // RLS: celular de outra clínica não aparece, então não é removido; a mesma resposta de inexistente, de propósito
    return data && data.length > 0 ? ok({ id }) : falha("NAO_ENCONTRADO", "Celular inexistente.");
  },
};
