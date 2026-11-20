import "server-only";
import { falha, ok } from "@/lib/errors";
import { lerSessaoSimulada } from "@/server/checkin/sessao-simulada";
import { situacaoDe } from "@/server/checkin/simulado";
import type { PortaCadastro } from "./porta";

// Implementação simulada da "Confirme Seus Dados" até o grant (MIG-13a) e a pessoa da rede (MIG-12). Pessoa
// inventada; os CEPs são de logradouros públicos. A pessoa vem da sessão simulada (cookie com o desafio): "já tem
// cadastro" traz os dados; "cadastro novo" traz só o CPF confirmado, com o resto vazio e aberto. Salvar só confirma.
const CEPS: Record<string, { logradouro: string; bairro: string; cidade: string; uf: string }> = {
  "01310100": { logradouro: "Avenida Paulista", bairro: "Bela Vista", cidade: "São Paulo", uf: "SP" },
  "20040020": { logradouro: "Rua da Assembleia", bairro: "Centro", cidade: "Rio de Janeiro", uf: "RJ" },
};

const VAZIO = { nome: "", nomeSocial: "", celular: "", email: "", cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "", convenio: null };

export const portaCadastroSimulada: PortaCadastro = {
  async carregar() {
    const desafio = await lerSessaoSimulada();
    const situacao = desafio ? situacaoDe(desafio) : undefined;
    if (situacao === "cadastro_novo") return ok({ ...VAZIO, cpfMascarado: "···.···.777-35" });
    if (situacao !== "seguir") return falha("NAO_AUTENTICADO", "Sem sessão do check-in.");
    return ok({
      ...VAZIO,
      nome: "Helena Prado Antunes",
      cpfMascarado: "···.···.247-25", // máscara do Simulador ATTA-in (só os 5 últimos dígitos)
      celular: "11987654321",
      cep: "01310100",
      logradouro: "Avenida Paulista",
      bairro: "Bela Vista",
      cidade: "São Paulo",
      uf: "SP",
    });
  },
  async salvar() {
    if (!(await lerSessaoSimulada())) return falha("NAO_AUTENTICADO", "Sem sessão do check-in.");
    return ok({ salvoEm: new Date().toISOString() });
  },
  async buscarCep(cep) {
    const endereco = CEPS[cep];
    return endereco ? ok(endereco) : falha("NAO_ENCONTRADO", "CEP sem endereço.");
  },
};
