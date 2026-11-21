// Abas da barra de módulos do painel, na ordem do Simulador ATTA-in (captura 01): Agendamentos, Pacientes,
// Termos & Docs, ATTA | Métricas, Configurações. Rotas sob /painel (contrato do Tech Lead, ADR 0001 §4); quando o
// src/lib/auth/rotas.ts do MIG-03b existir, os caminhos passam a vir de lá.
// Métricas é do gestor e pode ser liberada ao Colaborador (PDD v206 §10.4.3, "Métricas liberável ao Colaborador: decisão
// da PO"): o ADMIN vê sempre, e o Colaborador vê com metrics.view na própria matriz (platform.membership_permission, MIG-06).
// Configurações é sempre exclusiva do ADMIN (§10.4.3). Quem autoriza de fato é a RLS e o has_permission: a aba só esconde.
export type Papel = "ADMIN" | "COLABORADOR";
// marca: a palavra ATTA vai sempre na fonte de marca (Guia de Design §2).
// permissao: a linha da matriz que libera a aba ao Colaborador ("módulo.ação", como em platform.membership_permission).
export type Permissao = "metrics.view";
export type Aba = { rotulo: string; href: string; grupo: "operacao" | "gestao"; somenteAdmin?: boolean; permissao?: Permissao; marca?: boolean };

export const ABAS: Aba[] = [
  { rotulo: "Agendamentos", href: "/painel/agenda", grupo: "operacao" },
  { rotulo: "Pacientes", href: "/painel/pacientes", grupo: "operacao" },
  { rotulo: "Termos & Docs", href: "/painel/documentos", grupo: "operacao" },
  { rotulo: "ATTA", href: "/painel/atta", grupo: "operacao", marca: true },
  { rotulo: "Métricas", href: "/painel/metricas", grupo: "gestao", permissao: "metrics.view" },
  { rotulo: "Configurações", href: "/painel/configuracoes", grupo: "gestao", somenteAdmin: true },
];

/**
 * Telas fora do painel que só abrem na produção com a porta real (check-in, Boarding Check): a lista única que o
 * moduloDisponivel consulta. O painel não usa mais esta lista: as 6 abas aparecem sempre (decisão do dono, 20/11,
 * PLANO "Abas e fidelidade ao simulador"), e a tela sem dado real mostra o estado vazio do design pela porta vazia
 * (modelo: src/server/agenda/porta.ts, #142), sem 404 e sem dado de mentira.
 */
export const MODULOS_PRONTOS: readonly string[] = [];

/**
 * Se uma tela de fora do painel pode abrir: na produção, só com a porta real (está em MODULOS_PRONTOS); fora da
 * produção (prévia, local e CI), também com a porta simulada, para revisão e QA. Só no servidor: no navegador o
 * VERCEL_ENV não existe.
 */
export const emProducao = () => process.env.VERCEL_ENV === "production";

export const moduloDisponivel = (href: string, prontos: readonly string[] = MODULOS_PRONTOS) =>
  prontos.includes(href) || !emProducao();

/**
 * As abas que a sessão vê (§10.4.3): o ADMIN vê todas; o Colaborador não vê Configurações e só vê Métricas com metrics.view
 * na própria matriz. Sem papel, só as de operação.
 */
export const abasDoPapel = (papel: Papel | null, permissoes: readonly string[] = []) =>
  ABAS.filter((aba) => papel === "ADMIN" || (!aba.somenteAdmin && (!aba.permissao || (papel === "COLABORADOR" && permissoes.includes(aba.permissao)))));

/** Se a sessão pode abrir a rota da aba: a mesma regra que mostra ou esconde a aba (a guarda das rotas usa esta). */
export const podeAbrirAba = (href: string, papel: Papel | null, permissoes: readonly string[] = []) =>
  abasDoPapel(papel, permissoes).some((aba) => aba.href === href);

/** A aba ativa é a do segundo segmento da rota (/painel/configuracoes/agendamentos → Configurações). */
export const abaAtiva = (caminho: string) => ABAS.find((aba) => caminho === aba.href || caminho.startsWith(`${aba.href}/`));
