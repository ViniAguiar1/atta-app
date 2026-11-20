// Abas da barra de módulos do painel, na ordem do Simulador ATTA-in (captura 01): Agendamentos, Pacientes,
// Termos & Docs, ATTA | Métricas, Configurações. Rotas sob /painel (contrato do Tech Lead, ADR 0001 §4); quando o
// src/lib/auth/rotas.ts do MIG-03b existir, os caminhos passam a vir de lá.
// Métricas é do gestor e pode ser liberada ao Colaborador (PDD v206 §10.4.3 e §10.5); Configurações é sempre exclusiva
// do ADMIN (§10.4.3). A matriz fina por módulo entra no MIG-06. Quem autoriza de fato é a RLS: a aba só esconde.
export type Papel = "ADMIN" | "COLABORADOR";
export type Aba = { rotulo: string; href: string; grupo: "operacao" | "gestao"; somenteAdmin?: boolean };

export const ABAS: Aba[] = [
  { rotulo: "Agendamentos", href: "/painel/agenda", grupo: "operacao" },
  { rotulo: "Pacientes", href: "/painel/pacientes", grupo: "operacao" },
  { rotulo: "Termos & Docs", href: "/painel/documentos", grupo: "operacao" },
  { rotulo: "ATTA", href: "/painel/atta", grupo: "operacao" },
  { rotulo: "Métricas", href: "/painel/metricas", grupo: "gestao", somenteAdmin: true },
  { rotulo: "Configurações", href: "/painel/configuracoes", grupo: "gestao", somenteAdmin: true },
];

export const abasDoPapel = (papel: Papel | null) => ABAS.filter((aba) => !aba.somenteAdmin || papel === "ADMIN");

/** A aba ativa é a do segundo segmento da rota (/painel/configuracoes/agendamentos → Configurações). */
export const abaAtiva = (caminho: string) => ABAS.find((aba) => caminho === aba.href || caminho.startsWith(`${aba.href}/`));
