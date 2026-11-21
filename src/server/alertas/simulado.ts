import "server-only";
import { falha, ok } from "@/lib/errors";
import type { PortaAlertas } from "./porta";
import { type AlertasDaEquipe, EVENTOS } from "./tipos";

// Porta simulada (prévia, local e CI, até o MIG-15): só dado fictício (domínio .test). Não guarda nada entre chamadas
// (nota da Security Engineer no #286): na prévia a mesma instância serve todas as sessões, e um destino digitado por
// uma pessoa apareceria para outra. Cada escrita devolve o estado inicial com o eco da própria mudança; recarregar a
// tela volta ao inicial. Valida como a porta real (e-mail e celular com DDD), para a tela mostrar a recusa no campo.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CELULAR = /^\d{10,11}$/;

const inicial = (): AlertasDaEquipe => ({
  email: { ativo: true, destinoMascarado: "al·····@clinica-exemplo.test" },
  whatsapp: { ativo: false, destinoMascarado: null },
  eventos: EVENTOS.map((e) => ({ chave: e.chave, email: e.chave === "checkin_concluido", whatsapp: false })),
  filtros: { pausaNoturna: false, frequenciaDoResumo: "tempo_real" },
  emPausaNoturna: false,
});


const mascararNumero = (numero: string) => `(${numero.slice(0, 2)}) ·····-${numero.slice(-4)}`;
const mascararEmail = (email: string) => {
  const [nome = "", dominio = ""] = email.split("@");
  return `${nome.slice(0, 2)}·····@${dominio}`;
};
const recusa = () => falha("VALIDACAO", "Destino inválido.", [{ campo: "address", code: "VALIDACAO" }], "ATTA-IN-0001:address");
const semDestino = () => falha("CONFLITO", "Canal sem destino.", undefined, "ATTA-IN-0003:address");
const canalDesligado = () => falha("CONFLITO", "Canal desligado.", undefined, "ATTA-IN-0003:estado");


export const portaAlertasSimulada: PortaAlertas = {
  ler: async () => ok(inicial()),
  async ligarCanal(canal, ativo) {
    const estado = inicial();
    if (ativo && !estado[canal].destinoMascarado) return semDestino(); // o banco recusa igual (MIG-15)
    estado[canal].ativo = ativo;
    return ok(estado);
  },
  async alterarCanal(canal, destino, ativar) {
    const estado = inicial();
    // como o banco (TL, 21/11): endereço novo com o canal desligado só vale ligando junto
    if (!estado[canal].ativo && !ativar) return canalDesligado();
    if (canal === "email") {
      if (!EMAIL.test(destino.trim())) return recusa();
      estado.email.destinoMascarado = mascararEmail(destino.trim());
    } else {
      const numero = destino.replace(/\D/g, "");
      if (!CELULAR.test(numero)) return recusa();
      estado.whatsapp.destinoMascarado = mascararNumero(numero);
    }
    if (ativar) estado[canal].ativo = true;
    return ok(estado);
  },
  async marcarEvento(chave, canal, marcado) {
    const estado = inicial();
    const evento = estado.eventos.find((e) => e.chave === chave);
    if (!evento) return falha("NAO_ENCONTRADO", "Evento inexistente.");
    evento[canal] = marcado;
    return ok(estado);
  },
  async salvarFiltros(filtros) {
    return ok({ ...inicial(), filtros: { ...filtros } });
  },
};
