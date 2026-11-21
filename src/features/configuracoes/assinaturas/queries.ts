import "server-only";
import { portaAssinaturas } from "@/server/assinaturas/porta";
import { portaDocumentos } from "@/server/documentos/porta";

// Leitura de Configurações › Assinaturas & Validade numa chamada só (modelo + chancela do preview), com a sessão.
export const carregarAssinaturas = () => portaAssinaturas.ler();

// Modelos de Termos & Docs (api.atta_in_template_list), para a Validade documental, só leitura (R46).
export const carregarModelos = () => portaDocumentos.listar();
