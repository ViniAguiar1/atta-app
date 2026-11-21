import "server-only";
import { moduloDisponivel } from "@/features/casca/abas";

// Stage = produção (PLANO; achado S3-4 da Segurança): /b/* e /boarding só abrem na produção com a porta real, pela lista
// única da casca (MODULOS_PRONTOS). "/boarding" entrou lá com a porta real (MIG-23 parte 3b); tirá-lo volta o 404.
export const boardingNoAr = (prontos?: readonly string[]) => moduloDisponivel("/boarding", prontos);
