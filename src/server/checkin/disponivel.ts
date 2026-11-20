import "server-only";
import { falha } from "@/lib/errors";
import { moduloDisponivel } from "@/features/casca/abas";

// Stage = produção (regra do dono; achado S3-4 da Segurança): enquanto o check-in usa a porta simulada, a produção não
// atende /checkin/** — nem a página nem as server actions de entrada. A prévia e o local seguem abertos, para o QA e
// os e2e. "/checkin" entra em MODULOS_PRONTOS no PR que ligar a porta real (grant do #30, MIG-13).
export const checkinNoAr = () => moduloDisponivel("/checkin");

/** A mesma resposta de rota inexistente: a produção não revela que existe um fluxo simulado. */
export const FORA_DO_AR = falha("NAO_ENCONTRADO", "Não encontrado.");
