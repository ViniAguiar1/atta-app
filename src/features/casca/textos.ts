// Textos da casca do painel (MIG-40). Rótulos das abas: Simulador ATTA-in, captura 01.
export const textos = {
  modulos: "Módulos do painel",
  barraClara: "Deixar a barra clara",
  barraEscura: "Deixar a barra escura",
  contador: (n: number) => `${n} pendente${n === 1 ? "" : "s"}`,
  sino: (n: number) => (n > 0 ? `Notificações, ${n} nova${n === 1 ? "" : "s"}` : "Notificações"),
} as const;
