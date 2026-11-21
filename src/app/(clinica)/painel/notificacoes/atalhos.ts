import { emProducao } from "@/features/casca/abas";
import { secaoDisponivel, secaoPorCaminho, urlDaSecao } from "@/features/configuracoes/secoes";
import type { Notificacao } from "@/features/notificacoes/schema";
import { textos } from "@/features/notificacoes/textos";

// Atalhos do sino ("Ir para …" e "Configurar em Configurações › Notificações"). Configurações é só do ADMIN (PDD
// §10.4.3), e uma seção de Configurações só vira atalho quando tem tela (secaoDisponivel), para o link nunca cair em
// "não encontrado" (❌ do Tech Lead Frontend no #211). Fica fora das features porque junta a casca e Configurações.
type Destino = NonNullable<Notificacao["destino"]>;

const HREF: Record<Destino, string> = {
  agenda: "/painel/agenda",
  pacientes: "/painel/pacientes",
  documentos: "/painel/documentos",
  equipe: urlDaSecao("equipe"),
  configuracoes: "/painel/configuracoes",
};
const SECAO: Partial<Record<Destino, string>> = { equipe: "equipe" };

const temTela = (caminho: string, producao: boolean) => {
  const secao = secaoPorCaminho(caminho);
  return secao ? secaoDisponivel(secao, producao) : false;
};

export function destinoDoAtalho(destino: Destino, admin: boolean, producao = emProducao()) {
  if (destino === "equipe" || destino === "configuracoes") {
    if (!admin) return null;
    const secao = SECAO[destino];
    if (secao && !temTela(secao, producao)) return null;
  }
  return { rotulo: textos.destinos[destino], href: HREF[destino] };
}

export const atalhoDeConfiguracoes = (admin: boolean, producao = emProducao()) =>
  admin && temTela("notificacoes", producao) ? urlDaSecao("notificacoes") : null;
