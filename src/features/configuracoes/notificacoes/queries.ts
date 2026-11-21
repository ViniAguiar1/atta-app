import "server-only";
import { portaAlertas } from "@/server/alertas/porta";

// Leitura de Configurações › Notificações, com a sessão do usuário (na porta real; até o MIG-15, simulada ou vazia).
export const carregarAlertas = () => portaAlertas.ler();
