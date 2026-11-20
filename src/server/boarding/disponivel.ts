import "server-only";
import { moduloDisponivel } from "@/features/casca/abas";

// Stage = produção (PLANO; achado S3-4 da Segurança): com a porta simulada, /b/* e /boarding respondem 404 na produção;
// a prévia, o local e o CI abrem, para o QA e os e2e. Mesma lista única da casca (MODULOS_PRONTOS), como o check-in
// (#110): "/boarding" entra lá no PR que ligar a porta real (MIG-23, Backend 3).
export const boardingNoAr = (prontos?: readonly string[]) => moduloDisponivel("/boarding", prontos);
