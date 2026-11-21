import "server-only";
import { falha, ok } from "@/lib/errors";
import type { PortaAlertas } from "./porta";
import { type AlertasDaEquipe, EVENTOS } from "./tipos";

// Porta simulada (prévia, local e CI, até o MIG-15): estado em memória, só com dado fictício (domínio .test, número
// gerado). Valida como o banco vai validar (e-mail e celular com DDD), para a tela mostrar a recusa no campo.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CELULAR = /^\d{10,11}$/;

const inicial = (): AlertasDaEquipe => ({
  email: { ativo: true, destinoMascarado: "al·····@clinica-exemplo.test" },
  whatsapp: { ativo: false, destinoMascarado: null },
  eventos: EVENTOS.map((e) => ({ chave: e.chave, email: e.chave === "checkin_concluido", whatsapp: false })),
  filtros: { pausaNoturna: false, frequenciaDoResumo: "tempo_real" },
  emPausaNoturna: false,
});

let estado = inicial();
/** só para os testes: volta ao estado inicial */
export const reiniciarAlertasSimulados = () => void (estado = inicial());

const mascararNumero = (numero: string) => `(${numero.slice(0, 2)}) ·····-${numero.slice(-4)}`;
const mascararEmail = (email: string) => {
  const [nome = "", dominio = ""] = email.split("@");
  return `${nome.slice(0, 2)}·····@${dominio}`;
};
const recusa = () => falha("VALIDACAO", "Destino inválido.", [{ campo: "destino", code: "VALIDACAO" }], "ATTA-IN-0001:destino");
const semDestino = () => falha("CONFLITO", "Canal sem destino.", undefined, "ATTA-IN-0003:address");
const copia = () => structuredClone(estado);

export const portaAlertasSimulada: PortaAlertas = {
  ler: async () => ok(copia()),
  async ligarCanal(canal, ativo) {
    if (ativo && !estado[canal].destinoMascarado) return semDestino(); // o banco recusa igual (MIG-15)
    estado[canal].ativo = ativo;
    return ok(copia());
  },
  async alterarCanal(canal, destino, ativar) {
    if (canal === "email") {
      if (!EMAIL.test(destino.trim())) return recusa();
      estado.email.destinoMascarado = mascararEmail(destino.trim());
    } else {
      const numero = destino.replace(/\D/g, "");
      if (!CELULAR.test(numero)) return recusa();
      estado.whatsapp.destinoMascarado = mascararNumero(numero);
    }
    if (ativar) estado[canal].ativo = true;
    return ok(copia());
  },
  async marcarEvento(chave, canal, marcado) {
    const evento = estado.eventos.find((e) => e.chave === chave);
    if (!evento) return falha("NAO_ENCONTRADO", "Evento inexistente.");
    evento[canal] = marcado;
    return ok(copia());
  },
  async salvarFiltros(filtros) {
    estado.filtros = { ...filtros };
    return ok(copia());
  },
};
