import "server-only";
import { falhaDeValidacao, ok } from "@/lib/errors";
import { iniciais } from "@/lib/texto/iniciais";
import { maskCpf } from "@/server/crypto/cpf";
import {
  entradaDaAcaoSchema,
  filtroDoDiaSchema,
  filtroDoPeriodoSchema,
  filtroDosConcluidosSchema,
  type Acao,
  type AvisoDaAgenda,
  type LinhaDaAgenda,
  type ResumoDaAgenda,
} from "@/features/agenda/schema";
import type { PortaAgenda } from "./porta";

// Agenda simulada, para a tela andar antes do MIG-11. Só dado fictício: CPFs gerados (dígito verificador válido,
// ninguém real), nomes e clínica do Simulador ATTA-in (captura 01 e 06). Sem dica na tela (regra do stage).
// O "hoje" é o da clínica (America/Sao_Paulo, o padrão de platform.tenant.timezone), nunca o do navegador.
// Dia que não é hoje volta vazio. As ações seguem a tabela "Ações por estado" do §10.2.2, como o banco vai calcular.

const FUSO = "America/Sao_Paulo";
const OFFSET = "-03:00"; // São Paulo sem horário de verão desde 2019

export const hojeNaClinica = (agora = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const em = (dataLocal: string, hora: string) => `${dataLocal}T${hora}:00${OFFSET}`;

const HELENA = { vinculoId: id(901), nomeExibicao: "Dra. Helena Prado" };
const CAIO = { vinculoId: id(902), nomeExibicao: "Dr. Caio Andrade" };

const acoes = (...lista: Acao[]) => lista.map((acao) => ({ acao }));
// Editar fica à vista e desabilitado depois que o check-in começa (§10.2.2; simulador, captura 06).
const editarDesabilitado = { acao: "editar" as const, desabilitadaPor: "edit_after_checkin" };

type Semente = Omit<LinhaDaAgenda, "inicio" | "paciente" | "boardingCheckEnviadoEm"> & {
  hora: string;
  nome: string;
  cpf: string | null;
  boardingCheckAs?: string;
};

const SEMENTES: Semente[] = [
  {
    id: id(1), hora: "09:30", nome: "Mariana Costa Albuquerque", cpf: "65326948435",
    duracaoMin: 60, tipo: "procedimento", modalidade: "presencial",
    servicos: [{ id: id(101), nome: "Toxina botulínica" }], profissional: HELENA,
    documentos: [
      { id: id(201), nome: "Consentimento: toxina botulínica", opcional: false, estado: "vinculado" },
      { id: id(202), nome: "Autorização de uso de imagem", opcional: true, estado: "vinculado" },
    ],
    status: "agendado", atrasado: true, confirmacao: "confirmado",
    acoes: acoes("editar", "remarcar", "marcar_ausente", "fluxo_alternativo", "fluxo_impresso", "detalhes", "cancelar"),
  },
  {
    id: id(2), hora: "10:00", nome: "Rafael Menezes", cpf: "69030722509",
    duracaoMin: 60, tipo: "procedimento", modalidade: "presencial",
    servicos: [{ id: id(102), nome: "Preenchimento com ácido hialurônico" }], profissional: HELENA,
    documentos: [{ id: id(203), nome: "Consentimento: ácido hialurônico", opcional: false, estado: "vinculado" }],
    status: "em_preenchimento", atrasado: false, confirmacao: "confirmado",
    acoes: [editarDesabilitado, ...acoes("fluxo_alternativo", "fluxo_impresso", "detalhes", "cancelar")],
  },
  {
    id: id(3), hora: "10:30", nome: "Beatriz Nogueira", cpf: "24990190696",
    duracaoMin: 30, tipo: "consulta", modalidade: "presencial",
    servicos: [{ id: id(103), nome: "Consulta de avaliação facial" }], profissional: CAIO,
    documentos: [],
    status: "pronto", atrasado: false, confirmacao: "confirmado", boardingCheckAs: "10:41",
    acoes: [editarDesabilitado, ...acoes("reenviar_boarding_check", "concluir_pela_recepcao", "envios_dos_links", "detalhes", "cancelar")],
  },
  {
    id: id(4), hora: "11:00", nome: "Juliana Prates", cpf: "43157280120",
    duracaoMin: 60, tipo: "procedimento", modalidade: "presencial",
    servicos: [{ id: id(104), nome: "Bioestimulador de colágeno" }], profissional: HELENA,
    documentos: [
      { id: id(204), nome: "Consentimento: bioestimulador", opcional: false, estado: "assinado" },
      { id: id(205), nome: "Autorização de uso de imagem", opcional: true, estado: "recusado" },
    ],
    status: "em_atendimento", atrasado: false, confirmacao: "confirmado", boardingCheckAs: "10:44",
    acoes: [editarDesabilitado, ...acoes("reenviar_boarding_check", "concluir_pela_recepcao", "envios_dos_links", "detalhes", "cancelar")],
  },
  {
    id: id(5), hora: "14:00", nome: "Carla Siqueira", cpf: "12204539007",
    duracaoMin: 60, tipo: "procedimento", modalidade: "presencial",
    servicos: [{ id: id(105), nome: "Peeling químico médio" }], profissional: CAIO,
    documentos: [{ id: id(206), nome: "Consentimento: peeling químico", opcional: false, estado: "vinculado" }],
    status: "ausente", atrasado: false, confirmacao: "confirmado",
    acoes: [{ acao: "editar", desabilitadaPor: "edit_not_scheduled" }, ...acoes("reabrir_preenchimento", "detalhes", "cancelar")],
  },
  {
    id: id(6), hora: "15:00", nome: "Paulo Teixeira", cpf: "99260462150",
    duracaoMin: 30, tipo: "avaliacao", modalidade: "presencial",
    servicos: [{ id: id(106), nome: "Avaliação corporal" }], profissional: CAIO,
    documentos: [],
    status: "cancelado", atrasado: false, confirmacao: "fora_da_janela",
    acoes: acoes("detalhes"),
  },
  {
    id: id(7), hora: "16:30", nome: "Eduardo Lima", cpf: "16076301252",
    duracaoMin: 60, tipo: "procedimento", modalidade: "presencial",
    servicos: [{ id: id(107), nome: "Preenchimento labial" }], profissional: CAIO,
    documentos: [],
    status: "agendado", atrasado: false, confirmacao: "a_confirmar",
    acoes: acoes("editar", "confirmar", "remarcar", "marcar_ausente", "fluxo_alternativo", "fluxo_impresso", "detalhes", "cancelar"),
  },
];

function linhasDe(dataLocal: string): LinhaDaAgenda[] {
  return SEMENTES.map(({ hora, nome, cpf, boardingCheckAs, ...resto }) => ({
    ...resto,
    inicio: em(dataLocal, hora),
    paciente: { tipo: "pessoa" as const, id: id(300 + Number(resto.id.slice(-3))), nomeExibicao: nome, cpfMascarado: cpf ? maskCpf(cpf) : null, iniciais: iniciais(nome) },
    boardingCheckEnviadoEm: boardingCheckAs ? em(dataLocal, boardingCheckAs) : null,
  }));
}

/** "2026-11-20" + n dias, sem fuso (só a data do calendário). */
function somarDias(dataLocal: string, n: number): string {
  const d = new Date(`${dataLocal}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Cópia de uma semente noutro dia, com outro id (sufixo) e o que mudar (estado, ações). */
function copiaEm(dataLocal: string, indice: number, sufixo: number, extra: Partial<LinhaDaAgenda>): LinhaDaAgenda | null {
  const base = linhasDe(dataLocal)[indice];
  if (!base) return null;
  return { ...base, id: id(sufixo), atrasado: false, boardingCheckEnviadoEm: null, ...extra };
}

/** Visão Todos: hoje (sem concluídos) e os próximos dias, só Agendado, por horário. */
function linhasDoPeriodo(hojeLocal: string): LinhaDaAgenda[] {
  const futuras = [1, 2].flatMap((dias) =>
    [0, 2, 6].map((indice) =>
      copiaEm(somarDias(hojeLocal, dias), indice, 1000 + dias * 10 + indice, {
        status: "agendado",
        confirmacao: indice === 6 ? "a_confirmar" : "confirmado",
        acoes: acoes("editar", "confirmar", "remarcar", "detalhes", "cancelar"),
      }),
    ),
  );
  return [...linhasDe(hojeLocal), ...futuras].filter((l): l is LinhaDaAgenda => l !== null && l.status !== "concluido");
}

/** Visão Concluídos: concluídos e ausentes ("Não realizado") de dias passados; o mês inclui a semana. */
function linhasConcluidas(hojeLocal: string, periodo: "semana" | "mes"): LinhaDaAgenda[] {
  const passado = acoes("envios_dos_links", "detalhes");
  const semana = [
    copiaEm(somarDias(hojeLocal, -1), 3, 2001, { status: "concluido", acoes: [...passado, { acao: "enviar_termos" }] }),
    copiaEm(somarDias(hojeLocal, -1), 4, 2002, { status: "ausente", acoes: passado }),
    copiaEm(somarDias(hojeLocal, -2), 1, 2003, { status: "concluido", acoes: [...passado, { acao: "enviar_termos" }] }),
  ];
  const resto = [copiaEm(somarDias(hojeLocal, -10), 0, 2004, { status: "concluido", acoes: passado })];
  return [...(periodo === "mes" ? [...resto, ...semana] : semana)]
    .filter((l): l is LinhaDaAgenda => l !== null)
    .sort((a, b) => b.inicio.localeCompare(a.inicio));
}

const casaNome = (busca: string | undefined, l: LinhaDaAgenda) =>
  !busca || semAcento(l.paciente.nomeExibicao).includes(semAcento(busca));

/** A regra do banco para o card e o aviso "Sem documento vinculado" (§10.2.2): procedimento presencial ou online
 *  ainda por acontecer, sem documento; Avaliação, Retorno e Consulta online não entram. */
const entraEmSemDocumento = (l: LinhaDaAgenda) =>
  l.tipo === "procedimento" && l.documentos.length === 0 && l.status === "agendado";

const semAcento = (texto: string) => texto.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");

/** Busca como a do banco: nome por trecho (sem acento) ou CPF completo (no banco, pelo HMAC). */
function casa(busca: string, semente: Semente): boolean {
  const digitos = busca.replace(/\D/g, "");
  if (digitos.length === 11) return semente.cpf === digitos;
  return semAcento(semente.nome).includes(semAcento(busca));
}

export const portaAgendaSimulada: PortaAgenda = {
  async dia(filtro) {
    const lido = filtroDoDiaSchema.safeParse(filtro);
    if (!lido.success) return falhaDeValidacao(lido.error.issues);
    const { dataLocal: pedido, vinculoProfissionalId, busca, status, semDocumento } = lido.data;
    const hojeLocal = hojeNaClinica();
    const dataLocal = pedido ?? hojeLocal;
    const linhas =
      dataLocal !== hojeLocal
        ? []
        : linhasDe(dataLocal).filter((linha, i) => {
            const semente = SEMENTES[i];
            if (!semente) return false;
            if (vinculoProfissionalId && linha.profissional.vinculoId !== vinculoProfissionalId) return false;
            if (status && !status.includes(linha.status)) return false;
            if (semDocumento && !entraEmSemDocumento(linha)) return false;
            return !busca || casa(busca, semente);
          });
    return ok({ dataLocal, hojeLocal, fuso: FUSO, linhas, proximoCursor: null });
  },

  async resumo({ vinculoProfissionalId }) {
    const linhas = linhasDe(hojeNaClinica()).filter(
      (l) => !vinculoProfissionalId || l.profissional.vinculoId === vinculoProfissionalId,
    );
    const conta = (status: LinhaDaAgenda["status"]) => linhas.filter((l) => l.status === status).length;
    const resumo: ResumoDaAgenda = {
      hojeFaltam: linhas.filter((l) => l.status !== "cancelado" && l.status !== "concluido").length,
      hojeConcluidos: 1,
      mesConcluidos: 2,
      mesHorariosLivres: 175,
      checkin: { emPreenchimento: conta("em_preenchimento"), pronto: conta("pronto"), emAtendimento: conta("em_atendimento") },
      confirmacao: { agendados: 6, aConfirmar: 2, confirmados: 4 },
      semDocumento: linhas.filter(entraEmSemDocumento).length,
    };
    return ok(resumo);
  },

  async periodo(filtro) {
    const lido = filtroDoPeriodoSchema.safeParse(filtro);
    if (!lido.success) return falhaDeValidacao(lido.error.issues);
    const { status, busca, vinculoProfissionalId } = lido.data;
    const hojeLocal = hojeNaClinica();
    const linhas = linhasDoPeriodo(hojeLocal).filter(
      (l) =>
        (!status || status.includes(l.status)) &&
        (!vinculoProfissionalId || l.profissional.vinculoId === vinculoProfissionalId) &&
        casaNome(busca, l),
    );
    return ok({ hojeLocal, fuso: FUSO, linhas, proximoCursor: null });
  },

  async concluidos(filtro) {
    const lido = filtroDosConcluidosSchema.safeParse(filtro);
    if (!lido.success) return falhaDeValidacao(lido.error.issues);
    const hojeLocal = hojeNaClinica();
    const linhas = linhasConcluidas(hojeLocal, lido.data.periodo).filter((l) => casaNome(lido.data.busca, l));
    return ok({ hojeLocal, fuso: FUSO, linhas, proximoCursor: null });
  },

  // Sem estado no servidor (a Vercel não garante a mesma instância): a simulada só confere a entrada.
  async acao(entrada) {
    const lida = entradaDaAcaoSchema.safeParse(entrada);
    if (!lida.success) return falhaDeValidacao(lida.error.issues);
    return ok(null);
  },

  async avisos() {
    const linhas = linhasDe(hojeNaClinica());
    const item = (l: LinhaDaAgenda, desde: string | null = null) => ({
      atendimentoId: l.id,
      nomeExibicao: l.paciente.nomeExibicao,
      inicio: l.inicio,
      desde,
    });
    const avisos: AvisoDaAgenda[] = [
      { tipo: "sem_documento", itens: linhas.filter(entraEmSemDocumento).map((l) => item(l)) },
      { tipo: "atrasado", itens: linhas.filter((l) => l.atrasado).map((l) => item(l)) },
      { tipo: "pronto_sem_boarding_check", itens: linhas.filter((l) => l.status === "pronto").map((l) => item(l, l.boardingCheckEnviadoEm)) },
      { tipo: "ausentes", itens: linhas.filter((l) => l.status === "ausente").map((l) => item(l)) },
    ]
      .filter((aviso) => aviso.itens.length > 0)
      .map((aviso) => ({ ...aviso, impressao: aviso.itens.map((i) => i.atendimentoId).join(",") }) as AvisoDaAgenda);
    return ok(avisos);
  },
};
