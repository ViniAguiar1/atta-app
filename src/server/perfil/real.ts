import "server-only";
import { z } from "zod";
import { falha, falhaDoBanco, MENSAGENS, ok, type ErroDoBanco } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { Database } from "@/lib/supabase/database.types";
import { criarClienteServidor } from "@/lib/supabase/server";
import { CAMPOS_DA_EMPRESA, type CampoDaEmpresa } from "./campos";
import type { PerfilDaClinica, PortaPerfil } from "./porta";

// Porta real do Perfil da Clínica (MIG-42) sobre api.clinic_profile e api.clinic_profile_set (#296, Backend 1; ADR 0001,
// §"Perfil da Clínica"). Cliente de servidor com a sessão do usuário: quem confere ADMIN com aal2, formato, CNPJ e campo
// protegido é o banco; aqui só o formato da resposta (Zod) e o mapeamento para o tipo da tela. Erro do banco sai por
// falhaDoBanco, com o reason (ATTA-IN-0003:protected_field, :cnpj_in_use). Nenhum valor no log, só o evento.

const texto = z.string().nullable();

// Só tipos vêm da porta.ts (ela importa este módulo; um import de valor fecharia o ciclo). A lista dos campos vem do
// campos.ts: a resposta precisa trazer as 14 chaves, e uma fora do contrato vira INTERNO.
const campos = z.object(Object.fromEntries(CAMPOS_DA_EMPRESA.map((c) => [c, z.string().nullable()])) as Record<CampoDaEmpresa, z.ZodNullable<z.ZodString>>);
const perfilDoBanco = z.object({
  created_at: z.string().nullable(),
  timezone: z.string().min(1),
  saved_at: z.string().nullable(),
  fields: campos,
  protected_fields: z.array(z.string()),
  manager: z.object({ full_name: texto, cpf_masked: texto, email_masked: texto, whatsapp_masked: texto }).nullable(),
  technical_lead: z
    .object({
      same_as_manager: z.boolean(),
      full_name: texto,
      cpf_masked: texto,
      council: texto,
      council_uf: texto,
      council_number: texto,
    })
    .nullable(),
  missing_required: z.array(z.string()),
});

// --- Cliente mínimo (o teste substitui); os argumentos são conferidos contra os tipos gerados -----------------------
type FuncoesDaApi = Database["api"]["Functions"];
type ArgsDoSet = FuncoesDaApi["clinic_profile_set"]["Args"];
type RespostaDoBanco = PromiseLike<{ data: unknown; error: ErroDoBanco | null }>;
export type ClienteDoPerfil = {
  schema(nome: "api"): { rpc(fn: "clinic_profile" | "clinic_profile_set", args?: ArgsDoSet): RespostaDoBanco };
};

function foraDoFormato(evento: string) {
  logger.error(evento, { code: "INTERNO" });
  return falha("INTERNO", MENSAGENS.INTERNO);
}

/** api.clinic_profile no tipo da tela. O RT "mesma pessoa" já vem com o nome e o CPF mascarado do gestor (banco). */
export function lerPerfil(data: unknown): PerfilDaClinica | null {
  const r = perfilDoBanco.safeParse(data);
  if (!r.success) return null;
  const { manager: g, technical_lead: rt } = r.data;
  return {
    desde: r.data.created_at,
    fuso: r.data.timezone,
    campos: r.data.fields,
    gestor: g && { nome: g.full_name, cpfMascarado: g.cpf_masked, emailMascarado: g.email_masked, whatsappMascarado: g.whatsapp_masked },
    responsavelTecnico: rt && {
      nome: rt.full_name,
      cpfMascarado: rt.cpf_masked,
      emailMascarado: null,
      whatsappMascarado: null,
      mesmaPessoa: rt.same_as_manager,
      conselho: rt.council,
      uf: rt.council_uf,
      registro: rt.council_number,
    },
    salvoEm: r.data.saved_at,
    faltando: r.data.missing_required,
  };
}

export function criarPortaPerfilReal(cliente: () => Promise<ClienteDoPerfil>): PortaPerfil {
  return {
    async perfil() {
      const { data, error } = await (await cliente()).schema("api").rpc("clinic_profile");
      if (error) return falhaDoBanco(error);
      const perfil = lerPerfil(data);
      return perfil ? ok(perfil) : foraDoFormato("perfil.leitura_fora_do_formato");
    },
    async salvarCampo(campo, valor) {
      // vazio = apagar o campo: o banco faz nullif(btrim(valor), '') e decide se o campo pode ficar vazio
      const args: ArgsDoSet = { p_field: campo, p_value: valor ?? "" };
      const { data, error } = await (await cliente()).schema("api").rpc("clinic_profile_set", args);
      if (error) return falhaDoBanco(error);
      const salvoEm = z.string().min(1).safeParse(data);
      return salvoEm.success ? ok({ salvoEm: salvoEm.data }) : foraDoFormato("perfil.salvo_fora_do_formato");
    },
  };
}

export const portaPerfilReal: PortaPerfil = criarPortaPerfilReal(
  async () => (await criarClienteServidor()) as unknown as ClienteDoPerfil,
);
