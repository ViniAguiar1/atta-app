import { Subabas } from "@/components/ui/Subabas";
import { textos } from "../textos";

// As 3 subabas de Termos & Docs (simulador, captura 39; PDD §10.3.2.1), todas visíveis (régua do Tech Lead Frontend):
// Formulários de Saúde e Banco de Perguntas abrem no estado vazio até a tela delas (MIG-22).
export const SUBABAS_DE_DOCUMENTOS = [
  { rotulo: textos.subabas.modelos, href: "/painel/documentos" },
  { rotulo: textos.subabas.formularios, href: "/painel/documentos/formularios" },
  { rotulo: textos.subabas.perguntas, href: "/painel/documentos/perguntas" },
] as const;

export function SubabasDeDocumentos({ ativa }: { ativa: (typeof SUBABAS_DE_DOCUMENTOS)[number]["href"] }) {
  return (
    <div className="text-[0.8125rem]">
      <Subabas rotulo={textos.subabas.rotulo} itens={SUBABAS_DE_DOCUMENTOS} ativa={ativa} />
    </div>
  );
}
