import "server-only";
import { falha } from "@/lib/errors";
import type { PortaImportacao } from "./porta";

// Porta vazia (regra de stage do Tech Lead Frontend): na produção, enquanto a importação real (MIG-34, Integrações) não
// entra, nada é inventado. Cota e preço reais só existem com a assinatura (MIG-32); a tela esconde a seção.
const indisponivel = async () => falha("INDISPONIVEL", "A importação de pacientes ainda não está disponível.");

export const portaImportacaoVazia: PortaImportacao = {
  situacao: indisponivel,
  urlDoModelo: indisponivel,
  declarar: indisponivel,
  iniciarEnvio: indisponivel,
  previa: indisponivel,
  confirmar: indisponivel,
  resultado: indisponivel,
};
