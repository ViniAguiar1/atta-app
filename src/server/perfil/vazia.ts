import "server-only";
import { falha, ok } from "@/lib/errors";
import type { PortaPerfil } from "./porta";

// Porta vazia do Perfil da Clínica (regra de stage do Tech Lead Frontend): na produção, até o backend do Backend 1, a
// tela abre no estado vazio do design e nada é gravado. Nada inventado.
export const portaPerfilVazia: PortaPerfil = {
  async perfil() {
    return ok(null);
  },
  async salvarCampo() {
    return falha("INDISPONIVEL", "Perfil da Clínica ainda sem gravação.");
  },
};
