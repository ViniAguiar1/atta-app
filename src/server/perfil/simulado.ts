import "server-only";
import { falha, ok } from "@/lib/errors";
import { cnpjValido, emailValido } from "@/lib/brasil/documentos";
import type { PerfilDaClinica, PortaPerfil } from "./porta";

// Perfil simulado, para a tela andar antes do backend e para a prova contra a captura 42. Só dado fictício: a clínica
// do simulador, CNPJ gerado (dígito válido, ninguém real), endereço inventado, e-mail em domínio reservado e o gestor e o RT só com
// máscara. Sem estado entre requisições: salvar devolve o saved_at e não guarda. A validação imita a do banco no básico.
const PERFIL: PerfilDaClinica = {
  desde: "2026-03-01T12:00:00Z",
  fuso: "America/Sao_Paulo",
  campos: {
    trade_name: "Clínica Aurora Estética",
    legal_name: "Aurora Serviços de Estética Ltda.",
    cnpj: "48309271000150", // gerado só pelo dígito verificador, ninguém real
    tax_registration: null,
    main_specialty: "Biomedicina Estética",
    address_cep: "00000000",
    address_street: "Rua das Acácias Floridas",
    address_number: "120",
    address_complement: "Sala 3",
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
    // CNPJ e Razão social: só o 1º preenchimento (contrato do TL); a simulada já tem os dois, então recusa como o banco
    if ((campo === "cnpj" || campo === "legal_name") && PERFIL.campos[campo]) {
      return falha("CONFLITO", "Campo protegido.", undefined, "ATTA-IN-0003:protected_field");
    }
    if (campo === "cnpj" && (!valor || !cnpjValido(valor))) return falha("VALIDACAO", "CNPJ inválido.", [{ campo, code: "VALIDACAO" }]);
    if (campo === "commercial_email" && valor && !emailValido(valor)) return falha("VALIDACAO", "E-mail inválido.", [{ campo, code: "VALIDACAO" }]);
    return ok({ salvoEm: new Date().toISOString() });
  },
};
