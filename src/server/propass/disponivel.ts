import "server-only";
import { moduloDisponivel } from "@/features/casca/abas";

// Stage = produção (PLANO; S3-4 da Segurança): rota com porta simulada responde 404 na produção. Lista única da casca
// (MODULOS_PRONTOS), como o check-in (#110) e o Boarding Check (#120). "/propass" entrou na lista com a porta real
// (peça 4 do MIG-55); a guarda fica para o caso de a lista voltar a não ter o módulo.
export const propassNoAr = (prontos?: readonly string[]) => moduloDisponivel("/propass", prontos);
