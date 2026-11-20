import "server-only";
import type { Resultado } from "@/lib/errors";
import type { DadosDoPaciente, DadosEditaveis } from "@/features/checkin/cadastro/schema";
import { portaCadastroSimulada } from "./simulado";

// Contrato entre a "Confirme Seus Dados" (MIG-51, Frontend 2) e a pessoa da rede (MIG-12, BE2). O paciente é
// resolvido pelo grant do check-in (cookie atta_grant, ADR 0004; função do MIG-13a): nenhum id vem do navegador.
// Até o grant entrar, a implementação é a simulada. A tela é igual nas duas; valores de teste no guia-de-teste.md.
export type PortaCadastro = {
  /** NAO_AUTENTICADO: sem grant válido. */
  carregar(): Promise<Resultado<DadosDoPaciente>>;
  /** Atualização feita no check-in vale na hora, sem justificativa (RN-PAC-10). */
  salvar(dados: DadosEditaveis): Promise<Resultado<{ salvoEm: string }>>;
  /** Endereço pelo CEP (§11.5). NAO_ENCONTRADO: CEP sem endereço; o paciente preenche à mão. */
  buscarCep(cep: string): Promise<Resultado<{ logradouro: string; bairro: string; cidade: string; uf: string }>>;
};

export const portaCadastro: PortaCadastro = portaCadastroSimulada;
