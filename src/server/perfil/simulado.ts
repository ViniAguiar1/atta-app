import "server-only";
import { falha, ok } from "@/lib/errors";
import { cnpjValido } from "@/lib/brasil/documentos";
import type { PerfilDaClinica, PortaPerfil } from "./porta";

// Perfil simulado, para a tela andar antes do backend e para a prova contra a captura 42. Só dado fictício: a clínica
// do simulador, CNPJ de exemplo (dígito válido, ninguém real), e-mail em domínio reservado e o gestor e o RT só com
// máscara. Sem estado entre requisições: salvar devolve o saved_at e não guarda. A validação imita a do banco no básico.
const PERFIL: PerfilDaClinica = {
  desde: "2026-03-01T12:00:00Z",
  fuso: "America/Sao_Paulo",
  campos: {
    trade_name: "Clínica Aurora Estética",
    legal_name: "Aurora Serviços de Estética Ltda.",
    cnpj: "11222333000181",
    tax_registration: null,
    main_specialty: "Biomedicina Estética",
    address_cep: "01310930",
    address_street: "Avenida Paulista",
    address_number: "1000",
    address_complement: "Sala 101",
    address_city: "São Paulo",
    address_uf: "SP",
    phone: null,
    clinic_whatsapp: "11999990000",
    commercial_email: "contato@exemplo.test",
  },
  gestor: { nome: "Marina Duarte", cpfMascarado: "···.···.789-09", emailMascarado: "ma···@exemplo.test", whatsappMascarado: "(11) ·····-0001" },
  responsavelTecnico: null,
  salvoEm: "2026-11-21T13:40:00Z",
  faltando: ["technical_lead"],
};

export const portaPerfilSimulada: PortaPerfil = {
  async perfil() {
    return ok(PERFIL);
  },
  async salvarCampo(campo, valor) {
    if (campo === "cnpj" && (!valor || !cnpjValido(valor))) return falha("VALIDACAO", "CNPJ inválido.", [{ campo, code: "VALIDACAO" }]);
    return ok({ salvoEm: new Date().toISOString() });
  },
};
