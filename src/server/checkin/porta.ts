import "server-only";
import type { Resultado } from "@/lib/errors";
import type { Situacao } from "@/features/checkin/schema";
import { portaSimulada } from "./simulado";

// Contrato entre as telas do check-in (MIG-50, Frontend 2) e o domínio (MIG-13 check-in, BE2; MIG-31 WhatsApp, INT).
// Até esses itens entrarem, a implementação é a simulada, só com dado fictício. A real troca só o `portaCheckin`.
// Nada aqui devolve nome ou outro dado do cadastro antes do código confirmado (PDD §11.4).
export type PortaCheckin = {
  /** Clínica da placa QR; null quando o portal não existe. */
  clinica(portal: string): Promise<{ nomeFantasia: string } | null>;
  /** Envia o código ao celular do agendamento. NAO_ENCONTRADO: CPF sem atendimento hoje nesta clínica. */
  iniciar(portal: string, cpf: string): Promise<Resultado<{ desafio: string; finalCelular: string }>>;
  /** CONFLITO: código errado ou vencido. LIMITE: 5 erros, o código caiu (PDD §11.4). */
  confirmar(desafio: string, codigo: string): Promise<Resultado<{ situacao: Situacao }>>;
  /** LIMITE: mais de 3 reenvios em 15 min ou menos de 30 s desde o último (PDD §11.4). */
  reenviar(desafio: string): Promise<Resultado<{ finalCelular: string }>>;
};

export const portaCheckin: PortaCheckin = portaSimulada;
/** Mostra na tela o código da simulação; desliga sozinho quando a porta real entrar. */
export const MODO_SIMULADO = portaCheckin === portaSimulada;
