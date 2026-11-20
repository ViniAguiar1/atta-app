import "server-only";
import { moduloDisponivel } from "@/features/casca/abas";

// Stage = produção (PLANO; S3-4 da Segurança): com a porta simulada, /propass/* responde 404 na produção; a prévia, o
// local e o CI abrem. Lista única da casca (MODULOS_PRONTOS), como o check-in (#110) e o Boarding Check (#120):
// "/propass" entra lá no PR que ligar a porta real (MIG-14b, Backend 4).
export const propassNoAr = (prontos?: readonly string[]) => moduloDisponivel("/propass", prontos);
