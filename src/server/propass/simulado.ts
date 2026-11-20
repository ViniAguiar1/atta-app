import "server-only";
import { timingSafeEqual } from "node:crypto";
import { falha, ok } from "@/lib/errors";
import { hashDoSegredo } from "@/server/grant/politica";
import type { PortaPropass } from "./porta";

// PROpass simulado até o MIG-14b (Backend 4). Só dado fictício e sem estado no servidor: vale um link fixo. Um número
// de registro simula o conselho que não confere. Valores de teste no migracao/guia-de-teste.md, nunca na tela.
export const LINK_PROPASS_SIMULADO = "conv".padEnd(43, "A");
const HASH_DO_LINK = hashDoSegredo(LINK_PROPASS_SIMULADO) as Buffer;
const REGISTRO_QUE_NAO_CONFERE = "999999";
const REGISTRO_NAO_CONSULTADO = "888888"; // o que a produção devolve enquanto a R20 estiver aberta
const valido = (hash: Buffer) => timingSafeEqual(hash, HASH_DO_LINK);
const SEM_LINK = falha("NAO_ENCONTRADO", "Não encontrado.");

export const portaPropassSimulada: PortaPropass = {
  async resolver(hashDoLink) {
    if (!valido(hashDoLink)) return SEM_LINK;
    return ok({ clinica: "Clínica Aurora Estética", emailDoConvite: "bruna.reis@exemplo.test", conviteEm: "2026-11-20T19:20:00.000Z", fuso: "America/Sao_Paulo", etapa: "dados" });
  },
  async conferirConselho(hashDoLink, registro) {
    if (!valido(hashDoLink)) return SEM_LINK;
    if (registro.numero === REGISTRO_QUE_NAO_CONFERE) return ok({ situacao: "nao_confere" });
    if (registro.numero === REGISTRO_NAO_CONSULTADO) return ok({ situacao: "nao_consultado" });
    return ok({ situacao: "regularizado", consultadoEm: new Date().toISOString() });
  },
};
