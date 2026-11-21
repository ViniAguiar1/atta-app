import type { Metadata } from "next";
import { DataState } from "@/components/ui/DataState";
import { SubabasDeDocumentos } from "@/features/documentos/components/SubabasDeDocumentos";
import { textos } from "@/features/documentos/textos";

// Termos & Docs › Formulários de Saúde (PDD v206 §10.3.2.1; simulador, captura 39): a subaba aparece sempre e abre no estado vazio do
// design até a tela dela (MIG-22, Formulário de Saúde, Backend 3 e Frontend 2). Sem dado de mentira. É a definição das
// perguntas, não as respostas: a regra de leitura da saúde não se aplica aqui.
export const metadata: Metadata = { title: "Formulários de Saúde · Termos & Docs · ATTA-in" };

export default function Pagina() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="sr-only">{textos.subabas.formularios}</h1>
      <SubabasDeDocumentos ativa="/painel/documentos/formularios" />
      <DataState estado={{ tipo: "vazio" }} rotulo={textos.subabas.formularios} esqueleto={{ linhas: 3, alturaRem: 4 }} vazio={textos.formulariosVazio}>
        {null}
      </DataState>
    </div>
  );
}
