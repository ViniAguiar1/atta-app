import "server-only";
import type { Resultado } from "@/lib/errors";
import { portaPacientesReal } from "./real";

// Contrato entre as telas de Pacientes e da Pasta do Paciente (MIG-43, Frontend 3) e a pessoa da rede (MIG-12, BE2:
// api.patient_list, patient_search, patient_get, patient_register, patient_update e report_divergence). Diz o que a
// tela precisa; a forma das funções em `api` é do Backend 2, aprovada pelo Tech Lead (ADR 0001 §4).
// A tela usa a real (real.ts): cliente de servidor com a sessão do usuário (nunca a secret key), contatos abertos com
// getCofre('network') e a tela pronta: nome de exibição, documento mascarado (ADR 0002 §6) e campos derivados calculados
// no servidor. A simulada (simulado.ts) fica só para os testes de unidade, importada direto por eles.
// Vínculo em network_access = 'pending': só os campos que a própria clínica digitou, nunca dado da rede (dono, 20/11).

/** Documento à mostra, sempre mascarado pelo servidor (`···.···.247-25`); a tela não remascara. */
export type Identificacao =
  | { tipo: "cpf"; mascarado: string }
  | { tipo: "estrangeiro"; mascarado: string } // RNE ou RNM/CRNM (RN-PAC-02; dono, 20/11)
  | { tipo: "incompleto" }; // sem documento: cadastro incompleto (RN-PAC-02)

export type Contato = { celular: string | null; email: string | null };

/** Chip do selo "Identidade Verificada" (§10.1, RN-PAC-05/06; simulador, captura 09): só vem do ATTA me. */
export type SeloNaLista = "com_selo" | "selo_expirado";

/** Coluna Atendimento (simulador, captura 09): o último atendimento ou o próximo agendamento, no fuso da clínica. */
export type AtendimentoNaLista = {
  tipo: "ultimo" | "proximo";
  em: string; // AAAA-MM-DDTHH:mm, local da clínica
  procedimento: string;
  profissional: string;
};

/**
 * Uma linha da lista de Pacientes, igual ao Simulador ATTA-in (capturas 09 a 11): Paciente (avatar, nome e chip),
 * Identificação, Contato e Atendimento. Decisão do dono de 20/11 (PLANO, "Abas e fidelidade ao simulador"): aqui vale o
 * simulador, por cima da lista de colunas do PDD §10.
 */
export type LinhaDePaciente = {
  id: string;
  /** Nome de exibição: o social, quando houver (§10.1, "Nome social e identidade de gênero"). */
  nome: string;
  /** O nome mostrado é o social (o simulador marca com asterisco). */
  usaNomeSocial: boolean;
  /** Chip "Incompleto" (RN-PAC-02; estados do cadastro do §10.1), calculado no servidor, nunca na tela. */
  incompleto: boolean;
  /** Chip do selo; null sem selo. */
  selo: SeloNaLista | null;
  identificacao: Identificacao;
  /** AAAA-MM-DD; null quando não informado. */
  nascimento: string | null;
  /**
   * Já mascarado pelo servidor, como o CPF: "(11) ·····-4321" e "ju···@exemplo.test" (PDD §19.8, exibição parcial; pedido
   * da Segurança). O inteiro só na Pasta do Paciente. null quando a clínica não tem contato deste paciente.
   */
  contato: Contato | null;
  /** null quando não há atendimento nem agendamento nesta clínica ("Nenhum atendimento aqui"). */
  atendimento: AtendimentoNaLista | null;
};

/** Cursor da lista, em ordem de nome (keyset do api.patient_list). Opaco para a tela. */
export type Cursor = { nome: string; id: string };

/** `total`: pacientes ativos da clínica, para o rodapé "n de n ativo(s)"; null enquanto a API não devolver. */
export type PaginaDePacientes = { itens: LinhaDePaciente[]; proxima: Cursor | null; total: number | null };

export type OrigemDoCadastro = "recepcao" | "atta_me" | "importacao";

/** Cabeçalho da Pasta do Paciente (§10: selo, origem e o resto ficam na Pasta, não na lista). */
export type FichaDoPaciente = {
  id: string;
  nome: string;
  nomeCivil: string;
  nomeSocial: string | null;
  nascimento: string | null; // AAAA-MM-DD
  identificacao: Identificacao;
  contato: Contato | null;
  /** Selo "Identidade Verificada" (§10.1, RN-PAC-05/06): só vem do ATTA me; null sem selo válido. */
  selo: { validoAte: string } | null;
  origem: OrigemDoCadastro;
  vinculadoEm: string;
  /** pendente: a clínica vê só o que ela digitou, até o titular autorizar a portabilidade. */
  acessoARede: "proprio" | "pendente" | "autorizado";
};

export type DocumentoDoCadastro =
  | { tipo: "cpf"; numero: string }
  | { tipo: "estrangeiro"; especie: "rne" | "rnm"; numero: string }
  | { tipo: "sem_documento" };

export type DadosDoCadastro = {
  nomeCivil: string;
  nomeSocial: string | null;
  nascimento: string | null;
  documento: DocumentoDoCadastro;
  celular: string | null;
  email: string | null;
};

/**
 * Cartão do paciente que já está na rede ATTA (PDD §10.1, decisão do dono de 20/11): a recepção vê o cadastro existente
 * para confirmar e vincular, sem redigitar. Contato mascarado (§19.8); do Formulário de Saúde, só a contagem, nunca o
 * conteúdo. A consulta fica na auditoria (patient.lookup).
 */
export type CartaoDaRede = {
  id: string;
  nome: string; // de exibição: o social, quando houver
  nomeCivil: string;
  nomeSocial: string | null;
  nascimento: string | null;
  identificacao: Identificacao;
  incompleto: boolean;
  contato: Contato | null;
  selo: { validoAte: string } | null;
  /** só a contagem do Formulário de Saúde na rede, nunca o conteúdo; null quando a leitura não traz (já paciente) */
  respostasDeSaude: number | null;
};

export type ConsultaDeCpf =
  | { situacao: "nao_encontrado" } // primeira vez na rede: a recepção faz o cadastro mínimo
  | { situacao: "ja_paciente"; id: string } // já é paciente desta clínica: não cria outro (RN-PAC-01)
  | { situacao: "na_rede"; cartao: CartaoDaRede }; // existe em outra clínica: confirma e vincula

/** O que a recepção pode mudar; toda mudança leva justificativa (RN-PAC-03). */
export type MudancaDoCadastro = Partial<Pick<DadosDoCadastro, "nomeCivil" | "nomeSocial" | "nascimento" | "celular" | "email">>;

/** Lista fechada da divergência de identidade (RN-PAC-08; dono, 20/11). */
export const MOTIVOS_DE_DIVERGENCIA = [
  "nome_nao_confere",
  "data_nascimento_nao_confere",
  "cpf_nao_e_do_paciente",
  "outro",
] as const;
export type MotivoDeDivergencia = (typeof MOTIVOS_DE_DIVERGENCIA)[number];

export type PortaPacientes = {
  /** Pacientes vinculados à clínica da sessão, em ordem de nome, 50 por página. */
  listar(apos?: Cursor): Promise<Resultado<PaginaDePacientes>>;
  /**
   * Busca entre os pacientes da clínica: CPF/RNE completo (pelo HMAC, nunca em claro no banco) ou parte do nome
   * (2+ letras). Até 20 linhas. VALIDACAO: termo curto. Nunca acha quem é só da rede (sem oráculo, ADR 0021 A-24).
   */
  buscar(termo: string): Promise<Resultado<LinhaDePaciente[]>>;
  /** NAO_ENCONTRADO: inexistente ou sem vínculo com esta clínica (a mesma resposta, de propósito). */
  obter(id: string): Promise<Resultado<FichaDoPaciente>>;
  /**
   * "Buscar na rede" do Novo paciente (§10.1; simulador, capturas 15 a 18): o CPF vira HMAC no servidor. VALIDACAO: CPF
   * inválido. LIMITE: excesso de consultas (o banco limita por usuário e por clínica).
   */
  consultarCpf(cpf: string): Promise<Resultado<ConsultaDeCpf>>;
  /** Vincula à clínica a pessoa que já está na rede, sem redigitar (§10.1). NAO_ENCONTRADO: o CPF não está na rede. */
  vincularPorCpf(cpf: string): Promise<Resultado<{ id: string; situacao: "vinculado" | "ja_paciente" }>>;
  /** Cadastro mínimo de quem é novo na rede (§10.1). CONFLITO: já cadastrado nesta clínica (RN-PAC-01). */
  cadastrar(dados: DadosDoCadastro): Promise<Resultado<{ id: string; reaproveitado: boolean }>>;
  /** VALIDACAO: sem justificativa (RN-PAC-03). */
  atualizar(id: string, mudanca: MudancaDoCadastro, justificativa: string): Promise<Resultado<{ salvoEm: string }>>;
  /** A clínica só reporta; quem investiga é a ATTA, e nada bloqueia o atendimento (RN-PAC-08). */
  reportarDivergencia(id: string, motivo: MotivoDeDivergencia): Promise<Resultado<{ protocolo: string }>>;
};

export const portaPacientes: PortaPacientes = portaPacientesReal;
