import { textos } from "./textos";

// Subabas de Pacientes (Simulador ATTA-in, captura 09): Pacientes · Pasta do Paciente.
export const SUBABAS_DE_PACIENTES = [
  { rotulo: textos.subabas.pacientes, href: "/painel/pacientes" },
  { rotulo: textos.subabas.pasta, href: "/painel/pacientes/pasta" },
] as const;
