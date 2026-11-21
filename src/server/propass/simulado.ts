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
const REGISTRO_SEM_TERMO = "777777"; // simula a clínica sem o modelo ativo do Termo de Autorização
const CPF_RECUSADO = "11144477735"; // simula a recusa de identidade no envio
const valido = (hash: Buffer) => timingSafeEqual(hash, HASH_DO_LINK);
const SEM_LINK = falha("NAO_ENCONTRADO", "Não encontrado.");

export const portaPropassSimulada: PortaPropass = {
  async resolver(hashDoLink) {
    if (!valido(hashDoLink)) return SEM_LINK;
    return ok({ clinica: "Clínica Aurora Estética", emailDoConvite: "bruna.reis@exemplo.test", conviteEm: "2026-11-20T19:20:00.000Z", fuso: "America/Sao_Paulo" });
  },
  async conferirConselho(hashDoLink, registro) {
    if (!valido(hashDoLink)) return SEM_LINK;
    if (registro.numero === REGISTRO_QUE_NAO_CONFERE) return ok({ situacao: "nao_confere" });
    if (registro.numero === REGISTRO_NAO_CONSULTADO) return ok({ situacao: "nao_consultado" });
    return ok({ situacao: "regularizado", consultadoEm: new Date().toISOString() });
  },
  async termo(hashDoLink, registro) {
    if (!valido(hashDoLink)) return SEM_LINK;
    if (registro.numero === REGISTRO_SEM_TERMO) return SEM_TERMO;
    return ok(termoSimulado(registro));
  },
  async enviar(hashDoLink, envio) {
    if (!valido(hashDoLink)) return SEM_LINK;
    if (envio.dados.numero === REGISTRO_SEM_TERMO) return ok({ status: "sem_termo" });
    if (envio.dados.cpf === CPF_RECUSADO) return ok({ status: "recusado" });
    return ok({ status: "ok" });
  },
};

const SEM_TERMO = falha("CONFLITO", "Termo de Autorização não publicado.", undefined, "ATTA-IN-0003:authorization_template");

// Texto do simulador (captura 26), completado com as cláusulas do PDD §10.4.3 (decisão do CTO, P2c). Na real, vem da
// versão vigente do modelo de sistema. Clínica e CNPJ fictícios.
function termoSimulado(r: { nome: string; conselho: string; numero: string; uf: string }) {
  return {
    titulo: "Termo de Autorização de Uso de Imagem de Assinatura Digital",
    paragrafos: [
      `Eu, ${r.nome}, inscrita(o) no ${r.conselho.toUpperCase()}-${r.uf} ${r.numero}, autorizo Aurora Serviços de Estética Ltda. (CNPJ 41.218.605/0001-37), estabelecimento "Clínica Aurora Estética", a:`,
      "(i) reproduzir digitalmente a imagem da minha assinatura manuscrita, capturada nesta tela, neste momento;",
      "(ii) aplicar essa imagem, sempre acompanhada do ATTA Sign (resumo criptográfico SHA-256, data e hora e origem), exclusivamente aos documentos vinculados aos atendimentos realizados por mim neste estabelecimento;",
      "(iii) guardar o histórico das assinaturas aplicadas pelo prazo legal de retenção.",
      "Declaro ciência de que os documentos dos meus atendimentos seguem o modelo de quatro estados (Pré-assinado → Assinado definitivo) e só se tornam Assinado definitivo depois que eu confirmo a conclusão do atendimento correspondente. Não existe assinatura definitiva automática.",
      "Declaro ciência de que esta autorização vale somente para os procedimentos em que estou habilitada(o) pelo meu conselho profissional e autorizada(o) por este estabelecimento, e de que a assinatura não transfere nem altera a minha responsabilidade técnica e ética perante o meu conselho.",
      "Declaro ciência de que o gestor do estabelecimento pode acessar o resumo estruturado do atendimento que eu preencher, e de que cada acesso fica registrado.",
      "Esta autorização vale por prazo indeterminado, cessa com a minha saída do estabelecimento e pode ser revogada a qualquer momento, com efeito para o futuro: o documento já assinado antes da revogação continua válido.",
      "Fundamento: art. 10, § 2º, da Medida Provisória nº 2.200-2/2001.",
    ],
  };
}
