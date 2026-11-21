import "server-only";
import { falha, ok } from "@/lib/errors";
import { iniciais } from "@/lib/texto/iniciais";
import { isValidCpf, maskCpf, normalizeCpf } from "@/server/crypto/cpf";
import type { AgendamentoDaPasta, CartaoDaRede, FichaDoPaciente, LinhaDePaciente, PortaPacientes } from "./porta";

// dois agendamentos fictícios para a seção da Pasta (como na captura 13: um em atendimento com pendência, um agendado)
const idSim = (n: number) => `5a5a0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function agendamentosSimulados(pessoa: { id: string; nome: string; cpf: string | null }): AgendamentoDaPasta[] {
  const base = {
    duracaoMin: 60,
    tipo: "procedimento" as const,
    modalidade: "presencial" as const,
    paciente: { tipo: "pessoa" as const, id: pessoa.id, nomeExibicao: pessoa.nome, cpfMascarado: pessoa.cpf ? maskCpf(pessoa.cpf) : null, iniciais: iniciais(pessoa.nome) },
    servicos: [{ id: idSim(101), nome: "Peeling químico médio" }],
    profissional: { vinculoId: idSim(901), nomeExibicao: "Dr. Caio Andrade" },
    documentos: [],
    atrasado: false,
    confirmacao: "confirmado" as const,
    boardingCheckEnviadoEm: null,
    acoes: [],
  };
  return [
    { ...base, id: idSim(2), inicio: "2026-11-20T14:00:00-03:00", status: "agendado", marcos: { checkin: null, pronto: null, emAtendimento: null, concluido: null }, pendencia: { tipo: "termo_nao_assinado", obrigatoria: true }, termos: 1, docsClinicos: 0 },
    { ...base, id: idSim(1), inicio: "2026-11-19T11:30:00-03:00", status: "em_atendimento", marcos: { checkin: "2026-11-19T11:20:00-03:00", pronto: "2026-11-19T11:24:00-03:00", emAtendimento: "2026-11-19T11:35:00-03:00", concluido: null }, pendencia: { tipo: "termo_nao_assinado", obrigatoria: true }, termos: 2, docsClinicos: 0 },
  ];
}

// Implementação simulada da porta de Pacientes, para a tela andar antes da porta real. Só dado fictício: CPFs gerados
// (dígito verificador válido, ninguém real), nomes, celulares e e-mails inventados. Sem estado entre requisições: o
// cadastro e a edição respondem como a real, mas não gravam. A aba fica escondida enquanto esta for a porta em uso.

type Simulado = LinhaDePaciente & { cpf: string | null; ficha: Pick<FichaDoPaciente, "origem" | "selo" | "acessoARede"> };

type Dados = Omit<LinhaDePaciente, "id" | "identificacao" | "usaNomeSocial" | "incompleto" | "selo" | "atendimento"> & {
  cpf: string | null;
  social?: boolean;
  atendimento?: LinhaDePaciente["atendimento"];
  ficha?: Simulado["ficha"];
};

const linha = (n: number, d: Dados): Simulado => ({
  id: `5a5a0000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  nome: d.nome,
  usaNomeSocial: d.social ?? false,
  incompleto: !d.cpf || !d.nascimento || !d.contato?.celular,
  identificacao: d.cpf ? { tipo: "cpf", mascarado: maskCpf(d.cpf) } : { tipo: "incompleto" },
  selo: d.ficha?.selo ? "com_selo" : null,
  nascimento: d.nascimento,
  contato: d.contato,
  atendimento: d.atendimento ?? null,
  cpf: d.cpf,
  ficha: d.ficha ?? { origem: "recepcao", selo: null, acessoARede: "proprio" },
});

export const PACIENTES_SIMULADOS: readonly Simulado[] = [
  linha(1, {
    nome: "Juliana Prates", cpf: "52998224725", nascimento: "1990-09-17",
    contato: { celular: "(11) 98765-4321", email: "juliana.prates@exemplo.test" },
    atendimento: { tipo: "ultimo", em: "2026-11-20T11:00", procedimento: "Bioestimulador de colágeno", profissional: "Dra. Helena Prado" },
    ficha: { origem: "atta_me", selo: { validoAte: "2027-06-30" }, acessoARede: "autorizado" },
  }),
  linha(2, {
    nome: "Carla Siqueira", social: true, cpf: "11144477735", nascimento: "1982-01-30",
    contato: { celular: "(11) 97654-3210", email: null },
    atendimento: { tipo: "ultimo", em: "2026-10-14T14:00", procedimento: "Peeling químico médio", profissional: "Dr. Caio Andrade" },
  }),
  linha(3, { nome: "Eduardo Lima", cpf: "39053344705", nascimento: null, contato: null }),
  linha(4, {
    nome: "Alana Duarte", cpf: "86246109071", nascimento: "1994-07-02",
    contato: { celular: "(21) 99876-5432", email: "alana.duarte@exemplo.test" },
    atendimento: { tipo: "ultimo", em: "2026-10-02T09:30", procedimento: "Toxina botulínica", profissional: "Dra. Helena Prado" },
  }),
  linha(5, {
    nome: "Bruno Teixeira", cpf: "47382169022", nascimento: "1979-03-11",
    contato: { celular: "(31) 98877-6655", email: null },
    ficha: { origem: "recepcao", selo: null, acessoARede: "pendente" },
  }),
  linha(6, {
    nome: "Diana Ferraz", cpf: "21536784982", nascimento: "1988-11-21",
    contato: { celular: "(41) 99123-4567", email: "diana.ferraz@exemplo.test" },
    atendimento: { tipo: "ultimo", em: "2026-11-03T16:30", procedimento: "Preenchimento labial", profissional: "Dr. Caio Andrade" },
    ficha: { origem: "importacao", selo: null, acessoARede: "proprio" },
  }),
  linha(7, { nome: "Fábio Moreira", cpf: null, nascimento: "2012-05-12", contato: { celular: "(11) 96543-2109", email: null } }),
  linha(8, {
    nome: "Gabriela Antunes", cpf: "29537914852", nascimento: "1995-05-03",
    contato: { celular: "(51) 98234-5678", email: "gabriela.antunes@exemplo.test" },
    atendimento: { tipo: "ultimo", em: "2026-08-21T10:15", procedimento: "Limpeza de pele profunda", profissional: "Laís Ferraz" },
  }),
  linha(9, {
    nome: "Heitor Campos", cpf: "73181936006", nascimento: "1984-08-09",
    contato: { celular: "(11) 95432-1098", email: null },
    atendimento: { tipo: "ultimo", em: "2026-11-18T08:30", procedimento: "Microagulhamento", profissional: "Laís Ferraz" },
  }),
  linha(10, {
    nome: "Íris Nogueira", cpf: "60316544078", nascimento: "2010-02-03",
    contato: { celular: "(19) 99655-0707", email: "iris.nogueira@exemplo.test" },
  }),
];

// pessoa só da rede (de outra clínica), para o "Buscar na rede" simulado: CPF gerado, nome inventado
const NA_REDE: Record<string, CartaoDaRede> = {
  "11222333023": {
    id: "5a5a0000-0000-4000-8000-000000000099",
    nome: "Marina Costa",
    nomeCivil: "Marina Costa",
    nomeSocial: null,
    nascimento: "1991-04-12",
    identificacao: { tipo: "cpf", mascarado: maskCpf("11222333023") },
    incompleto: false,
    contato: { celular: "(11) ·····-5566", email: "ma···@exemplo.test" },
    selo: null,
    respostasDeSaude: 0,
  },
};

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const porNome = (a: Simulado, b: Simulado) => semAcento(a.nome).localeCompare(semAcento(b.nome)) || a.id.localeCompare(b.id);
const publico = (p: Simulado): LinhaDePaciente => ({
  id: p.id,
  nome: p.nome,
  usaNomeSocial: p.usaNomeSocial,
  incompleto: p.incompleto,
  identificacao: p.identificacao,
  nascimento: p.nascimento,
  contato: p.contato,
  selo: p.selo,
  atendimento: p.atendimento,
});

export function criarPortaSimulada(pacientes: readonly Simulado[] = PACIENTES_SIMULADOS, porPagina = 50): PortaPacientes {
  const ordenados = [...pacientes].sort(porNome);
  const existe = (id: string) => ordenados.some((p) => p.id === id);
  return {
    async listar(apos) {
      const inicio = apos ? ordenados.findIndex((p) => p.id === apos.id) + 1 : 0;
      const pagina = ordenados.slice(inicio, inicio + porPagina);
      const ultimo = pagina.at(-1);
      const temMais = inicio + porPagina < ordenados.length;
      return ok({
        itens: pagina.map(publico),
        proxima: temMais && ultimo ? { nome: ultimo.nome, id: ultimo.id } : null,
        total: ordenados.length,
      });
    },
    async buscar(termo) {
      const cpf = normalizeCpf(termo);
      if (cpf && isValidCpf(cpf)) return ok(ordenados.filter((p) => p.cpf === cpf).map(publico));
      const parte = semAcento(termo.trim());
      if (parte.length < 2 || /^\d+$/.test(parte.replace(/[.\-\s]/g, ""))) return falha("VALIDACAO", "Busca curta.");
      return ok(ordenados.filter((p) => semAcento(p.nome).includes(parte)).slice(0, 20).map(publico));
    },
    async obter(id) {
      const p = ordenados.find((x) => x.id === id);
      if (!p) return falha("NAO_ENCONTRADO", "Paciente não encontrado.");
      return ok({
        id: p.id,
        nome: p.nome,
        nomeCivil: p.nome,
        nomeSocial: p.usaNomeSocial ? p.nome : null,
        nascimento: p.nascimento,
        identificacao: p.identificacao,
        contato: p.contato,
        selo: p.ficha.selo,
        seloExpirouEm: null,
        arquivadoEm: null,
        origem: p.ficha.origem,
        vinculadoEm: "2026-11-01T12:00:00Z",
        acessoARede: p.ficha.acessoARede,
      });
    },
    async consultarCpf(cpf) {
      const normal = normalizeCpf(cpf);
      if (!normal || !isValidCpf(normal)) return falha("VALIDACAO", "CPF inválido.", [{ campo: "cpf", code: "VALIDACAO" }]);
      const daClinica = ordenados.find((p) => p.cpf === normal);
      if (daClinica) return ok({ situacao: "ja_paciente", id: daClinica.id });
      const naRede = NA_REDE[normal];
      return ok(naRede ? { situacao: "na_rede", cartao: naRede } : { situacao: "nao_encontrado" });
    },
    async vincularPorCpf(cpf) {
      const normal = normalizeCpf(cpf) ?? "";
      const daClinica = ordenados.find((p) => p.cpf === normal);
      if (daClinica) return ok({ id: daClinica.id, situacao: "ja_paciente" });
      const naRede = NA_REDE[normal];
      return naRede ? ok({ id: naRede.id, situacao: "vinculado" }) : falha("NAO_ENCONTRADO", "CPF fora da rede.");
    },
    async cadastrar(dados) {
      const { documento } = dados;
      if (documento.tipo === "cpf" && ordenados.some((p) => p.cpf === documento.numero)) {
        return falha("CONFLITO", "Paciente já cadastrado nesta clínica.");
      }
      return ok({ id: crypto.randomUUID(), reaproveitado: false });
    },
    async atualizar(id, _mudanca, justificativa) {
      if (!existe(id)) return falha("NAO_ENCONTRADO", "Paciente não encontrado.");
      if (!justificativa.trim()) return falha("VALIDACAO", "Justificativa obrigatória.", [{ campo: "justificativa", code: "VALIDACAO" }]);
      return ok({ salvoEm: new Date().toISOString() });
    },
    async reportarDivergenciaPorCpf(cpf) {
      const normal = normalizeCpf(cpf);
      if (!normal || !isValidCpf(normal)) return falha("VALIDACAO", "CPF inválido.", [{ campo: "cpf", code: "VALIDACAO" }]);
      return ok({ recebido: true as const });
    },
    async arquivar(id, arquivado) {
      if (!existe(id)) return falha("NAO_ENCONTRADO", "Paciente não encontrado.");
      return ok({ arquivado });
    },
    async reportarDivergencia(id) {
      if (!existe(id)) return falha("NAO_ENCONTRADO", "Paciente não encontrado.");
      return ok({ protocolo: crypto.randomUUID() });
    },
    async agendamentosDaPasta(id) {
      const p = ordenados.find((x) => x.id === id);
      if (!p) return falha("NAO_ENCONTRADO", "Paciente não encontrado.");
      const itens = agendamentosSimulados({ id: p.id, nome: p.nome, cpf: p.cpf });
      return ok({
        itens,
        totais: { agendamentos: itens.length, termosAssinados: 0, docsClinicos: 0, pendencias: itens.filter((i) => i.pendencia).length },
        hoje: { quantidade: 0, ultimoEm: null },
        proximo: null,
        fuso: "America/Sao_Paulo",
      });
    },
  };
}

export const portaPacientesSimulada = criarPortaSimulada();
