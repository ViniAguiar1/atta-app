// Tipos de Configurações › Assinaturas & Validade (PDD v206 §10.4.2). Sem "server-only": a tela usa os mesmos tipos.
// Valores do modelo como no types.ts que o PDD cita no 🐞 da §10.4.2 e no contrato do Tech Lead (ADR 0001,
// §"Modelo de Assinatura da Clínica"): documents.signature_settings.signature_model.
export const MODELOS = ["rt_apenas", "profissional_apenas", "rt_profissional"] as const;
export type ModeloDeAssinatura = (typeof MODELOS)[number];

/** Responsável Técnico da chancela; com "mesma pessoa que o gestor", o nome vem do gestor. Nunca o CPF. */
export type RtDaChancela = { nome: string | null; conselho: string | null; uf: string | null; numero: string | null };

/** Dados da chancela do preview, lidos do Perfil da Clínica no banco (tenant e tenant_responsible), sem cópia. */
export type Chancela = { nomeFantasia: string | null; razaoSocial: string | null; cnpj: string | null; rt: RtDaChancela | null };

export type ConfiguracaoDeAssinatura = {
  /** null = clínica ainda sem modelo escolhido (o padrão de clínica nova está em aberto com o CTO) */
  modelo: ModeloDeAssinatura | null;
  chancela: Chancela;
};
