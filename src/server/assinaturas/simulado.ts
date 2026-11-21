import "server-only";
import { ok } from "@/lib/errors";
import type { PortaAssinaturas } from "./porta";
import type { ConfiguracaoDeAssinatura } from "./tipos";

// Porta simulada (prévia, local e CI, até o backend): só dado fictício e sem estado entre chamadas (como a de
// Notificações, nota da Security Engineer no #286): cada escrita devolve o inicial com o eco da mudança.
const inicial = (): ConfiguracaoDeAssinatura => ({
  modelo: "rt_profissional",
  chancela: {
    nomeFantasia: "Clínica Exemplo",
    razaoSocial: "Clínica Exemplo Serviços de Saúde Ltda.",
    cnpj: "11.222.333/0001-81",
    rt: { nome: "Dra. Ana Exemplo", conselho: "CRM", uf: "SP", numero: "000000" },
  },
  rtCompleto: true,
});

export const portaAssinaturasSimulada: PortaAssinaturas = {
  ler: async () => ok(inicial()),
  salvarModelo: async (modelo) => ok({ ...inicial(), modelo }),
};
