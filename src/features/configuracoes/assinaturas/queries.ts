import "server-only";
import { portaAssinaturas } from "@/server/assinaturas/porta";

// Leitura de Configurações › Assinaturas & Validade numa chamada só (modelo + chancela do preview), com a sessão.
export const carregarAssinaturas = () => portaAssinaturas.ler();
