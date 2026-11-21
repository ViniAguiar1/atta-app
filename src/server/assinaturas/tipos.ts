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
  /** a clínica nova nasce com rt_profissional (PDD §16 e §10.4.2, conferido pelo Backend 6 e o CTO, 21/11) */
  modelo: ModeloDeAssinatura | null;
  chancela: Chancela;
  /** rt_complete do banco: false = o Perfil ainda não tem RT. Salvar qualquer modelo é aceito; a trava fica na
   *  consolidação do documento (PDD §10.4.1, CA-E01-02). A tela só avisa. */
  rtCompleto: boolean;
};

/** modelos em que o RT assina: sem RT no Perfil, a tela avisa */
export const MODELOS_COM_RT: readonly ModeloDeAssinatura[] = ["rt_apenas", "rt_profissional"];
