"use server";

import { isIP } from "node:net";
import { headers } from "next/headers";
import { falha, falhaDeValidacao, ok, type Resultado } from "@/lib/errors";
import { ipDoCliente } from "@/lib/http/correlacao";
import { logger } from "@/lib/logger";
import { lerHashDoConvite } from "@/server/propass/cookies";
import { propassNoAr } from "@/server/propass/disponivel";
import { portaPropass } from "@/server/propass/porta";
import { type ConferenciaDoConselho, dadosSchema, type DesfechoNaTela, envioSchema, type TermoCarregado } from "./schema";

// Server action do passo 1 → 2 do PROpass (POST; CPF e WhatsApp só no corpo). PDD §10.4.3. Confere o formato no
// servidor, pede ao backend a situação do registro no conselho e se a pessoa cria a senha ou usa a que já tem
// (identidade, sem oráculo de CPF). Não grava nada. Sem cookie do convite, a resposta é a mesma de link vencido.
// Log só com o desfecho, nunca com CPF, WhatsApp, PIN ou assinatura.

/** IP e navegador do pedido, para o limite por IP e para o pacote do ATTA Sign (nunca para o log). */
async function origemDoPedido() {
  const h = await headers();
  return { ip: ipDoCliente(h, (v) => isIP(v) !== 0), userAgent: h.get("user-agent") };
}
export async function conferirDados(entrada: unknown): Promise<Resultado<ConferenciaDoConselho>> {
  if (!propassNoAr()) return falha("NAO_ENCONTRADO", "Não encontrado."); // porta simulada: fora da produção
  const dados = dadosSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  const hash = await lerHashDoConvite();
  if (!hash) return ok({ situacao: "link_sem_validade" });

  const { conselho, numero, uf, nome, cpf } = dados.data;
  const r = await portaPropass.conferirConselho(hash, { conselho, numero, uf, nome });
  logger.info("propass.conselho_conferido", { ok: r.ok, situacao: r.ok ? r.data.situacao : r.error.code });
  if (!r.ok) return r.error.code === "NAO_ENCONTRADO" ? ok({ situacao: "link_sem_validade" }) : r;
  if (r.data.situacao === "nao_confere") return ok(r.data);
  const id = await portaPropass.identidade(hash, { conselho, uf, numero, cpf }, await origemDoPedido());
  if (!id.ok) return id.error.code === "NAO_ENCONTRADO" ? ok({ situacao: "link_sem_validade" }) : id;
  return ok({ ...r.data, pedirSenha: id.data === "pedir_pin" });
}

const FORA_DA_PRODUCAO = falha("NAO_ENCONTRADO", "Não encontrado."); // porta simulada: fora da produção

/** Passo 2 → 3: o Termo de Autorização com os dados do profissional, para ler antes de assinar (PDD §10.4.3). */
export async function carregarTermo(entrada: unknown): Promise<Resultado<TermoCarregado>> {
  if (!propassNoAr()) return FORA_DA_PRODUCAO;
  const dados = dadosSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  const hash = await lerHashDoConvite();
  if (!hash) return ok({ situacao: "link_sem_validade" });
  const { conselho, numero, uf, nome } = dados.data;
  const r = await portaPropass.termo(hash, { conselho, numero, uf, nome });
  if (r.ok) return ok({ situacao: "pronto", termo: r.data });
  return r.error.code === "NAO_ENCONTRADO" ? ok({ situacao: "link_sem_validade" }) : r;
}

/**
 * Envio final do PROpass (api.propass_submit, tudo ou nada): dados, o Termo de Autorização assinado (PNG do quadro) e
 * o PIN de 4 números. Só segue com a leitura do termo até o fim. O PNG e o PIN só existem no corpo deste POST; o
 * servidor cifra o PNG e transforma o PIN em pin_mac antes do banco (portas do Backend 3 e do Backend 4).
 */
export async function enviarPropass(entrada: unknown): Promise<Resultado<DesfechoNaTela>> {
  if (!propassNoAr()) return FORA_DA_PRODUCAO;
  const envio = envioSchema.safeParse(entrada);
  if (!envio.success) return falhaDeValidacao(envio.error.issues);
  const hash = await lerHashDoConvite();
  if (!hash) return ok({ status: "link_sem_validade" });
  const assinaturaPng = Buffer.from(envio.data.assinatura.slice("data:image/png;base64,".length), "base64");
  const { abertoEm, rolagemCompletaEm } = envio.data.leitura;
  const r = await portaPropass.enviar(hash, {
    dados: envio.data.dados,
    assinaturaPng,
    pin: envio.data.pin,
    leitura: { abertoEm: new Date(abertoEm), rolagemCompletaEm: new Date(rolagemCompletaEm) },
    origem: await origemDoPedido(),
  });
  logger.info("propass.enviado", { ok: r.ok, status: r.ok ? r.data.status : r.error.code });
  if (r.ok) return ok(r.data);
  if (r.error.code === "NAO_ENCONTRADO") return ok({ status: "link_sem_validade" });
  if (r.error.code === "LIMITE") return ok({ status: "limite" });
  if (r.error.fields?.some((f) => f.campo === "pin")) {
    // reason do servidor: ATTA-IN-0001:pin_obvio | pin_formato | pin_obrigatorio | pin_existente
    const motivo = r.error.reason?.endsWith("pin_obvio") ? "obvio" : r.error.reason?.endsWith("pin_formato") ? "formato" : "outro";
    return ok({ status: "senha_invalida", motivo });
  }
  return r;
}
