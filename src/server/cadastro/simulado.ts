import "server-only";
import { falha, ok } from "@/lib/errors";
import type { PortaCadastro } from "./porta";

// Implementação simulada da "Confirme Seus Dados" até o grant (MIG-13a) e a pessoa da rede (MIG-12). Pessoa
// inventada; os CEPs são de logradouros públicos. Sem estado: salvar só confirma.
const CEPS: Record<string, { logradouro: string; bairro: string; cidade: string; uf: string }> = {
  "01310100": { logradouro: "Avenida Paulista", bairro: "Bela Vista", cidade: "São Paulo", uf: "SP" },
  "20040020": { logradouro: "Rua da Assembleia", bairro: "Centro", cidade: "Rio de Janeiro", uf: "RJ" },
};

export const portaCadastroSimulada: PortaCadastro = {
  async carregar() {
    return ok({
      nome: "Helena Prado Antunes",
      nomeSocial: "",
      cpfMascarado: "···.982.247-··",
      celular: "11987654321",
      email: "",
      cep: "01310100",
      logradouro: "Avenida Paulista",
      numero: "",
      complemento: "",
      bairro: "Bela Vista",
      cidade: "São Paulo",
      uf: "SP",
      convenio: null,
    });
  },
  async salvar() {
    return ok({ salvoEm: new Date().toISOString() });
  },
  async buscarCep(cep) {
    const endereco = CEPS[cep];
    return endereco ? ok(endereco) : falha("NAO_ENCONTRADO", "CEP sem endereço.");
  },
};
