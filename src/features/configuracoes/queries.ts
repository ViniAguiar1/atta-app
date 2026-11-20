import "server-only";
import { portaConfiguracoes } from "@/server/configuracoes/porta";

// Leitura no servidor (Server Component), com a sessão do usuário: nada de supabase-js autenticado no navegador.
export const carregarParametros = () => portaConfiguracoes.parametros();
