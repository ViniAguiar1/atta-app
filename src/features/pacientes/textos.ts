// Textos da lista de Pacientes (MIG-43). Colunas pelo PDD v206 §10 ("Pacientes, lista"); o formato de cada célula e os
// textos que o PDD não tem vêm do Simulador ATTA-in (capturas 09 e 10, README "Pacientes, Pasta do Paciente e Novo
// paciente"). O que não está em nenhum dos dois é provisório e vai para o textos-para-a-po.md.
import type { MarcaDeDocumento } from "@/server/pacientes/porta";

const data = (aaaaMmDd: string) => aaaaMmDd.split("-").reverse().join("/");

export const textos = {
  titulo: "Pacientes", // PDD §10 (aba do painel); só para leitor de tela: a tela não repete a aba
  tabela: "Pacientes da clínica", // provisório (legenda da tabela, só para leitor de tela)
  busca: {
    rotulo: "Buscar paciente por nome ou CPF", // simulador, captura 09 (rótulo acessível)
    placeholder: "Buscar por nome ou CPF", // simulador, captura 09
    curta: "Digite ao menos 2 letras do nome ou o CPF completo.", // provisório
    achados: (n: number) => (n === 1 ? "1 paciente encontrado" : `${n} pacientes encontrados`), // provisório (só leitor de tela)
  },
  colunas: {
    paciente: "Paciente", // PDD §10, "Pacientes, lista"
    identificacao: "Identificação", // PDD §10, "Pacientes, lista"
    contato: "Contato", // PDD §10, "Pacientes, lista"
    ultimoAtendimento: "Último atendimento", // PDD §10, "Pacientes, lista"
    documentos: "Documentos", // PDD §10, "Pacientes, lista"
  },
  incompleto: "Incompleto", // simulador, captura 10 (chip; estados do cadastro, PDD §10.1)
  nomeSocial: "usa nome social", // provisório (o asterisco do simulador, dito ao leitor de tela)
  identificacao: {
    cpfFalado: (final: string) => `CPF terminado em ${final}`, // provisório (padrão do painel, ADR 0002 §6)
    estrangeiro: "RNE", // provisório (RN-PAC-02; dono, 20/11: RNE ou RNM/CRNM)
    estrangeiroFalado: (final: string) => `RNE ou RNM terminado em ${final}`, // provisório
    semDocumento: "Sem documento", // provisório (RN-PAC-02)
    nascimento: (aaaaMmDd: string | null) => `Nasc. ${aaaaMmDd ? data(aaaaMmDd) : "—"}`, // simulador, captura 09
    semNascimentoFalado: "Nascimento não informado", // provisório (o "Nasc. —" dito ao leitor de tela)
  },
  semCelular: "Sem celular", // simulador, captura 09
  semEmail: "Sem e-mail", // simulador, captura 09
  atendimento: {
    // simulador, captura 09: "20/11/2026 às 08:30" e "Procedimento · Profissional"
    quando: (em: string) => `${data(em.slice(0, 10))} às ${em.slice(11, 16)}`,
    oQue: (procedimento: string, profissional: string) => `${procedimento} · ${profissional}`,
    nenhum: "Nenhum atendimento aqui", // simulador, captura 09
  },
  nenhumDocumento: "Nenhum documento", // simulador, captura 06 (o mesmo da agenda)
  marca: { vinculado: "vinculado", assinado: "assinado", recusado: "recusado" } satisfies Record<MarcaDeDocumento, string>, // PDD §10.2.2
  vazio: {
    titulo: "Nenhum paciente cadastrado", // provisório
    texto: "Os pacientes aparecem aqui quando a recepção faz o cadastro ou quando a base de pacientes é importada.", // provisório
  },
  rodape: (mostrados: number, total: number) => `${mostrados} de ${total} ativo(s)`, // simulador, captura 10
  carregarMais: "Carregar mais pacientes", // provisório (o simulador não pagina; a API pagina de 50 em 50)
  estado: "lista de pacientes", // provisório (rótulo do DataState para leitor de tela)
} as const;
