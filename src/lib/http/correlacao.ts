// Correlação e IP do usuário até a trilha de auditoria (auditoria de segurança S2-4; ADR 0003 §1). Funções puras: o
// proxy e os clientes do Supabase só aplicam.
// - x-request-id: gerado pelo proxy a cada requisição (uuid). O que vier do navegador é descartado, nunca reaproveitado.
// - x-atta-client-ip: o 1º item do x-forwarded-for que a Vercel entrega ao servidor (a Vercel sobrescreve esse
//   cabeçalho e não repassa IP externo). O valor que vier do navegador com esse nome é descartado no proxy.
export const CABECALHO_REQUEST_ID = "x-request-id";
export const CABECALHO_IP_DO_CLIENTE = "x-atta-client-ip";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** No proxy: cabeçalhos que seguem para o app, com o id novo e sem o IP que o navegador possa ter mandado. */
export function prepararCabecalhosDaRequisicao(recebidos: Headers, idNovo: string): Headers {
  const h = new Headers(recebidos);
  h.delete(CABECALHO_IP_DO_CLIENTE);
  h.set(CABECALHO_REQUEST_ID, idNovo);
  return h;
}

/** No servidor: o que vai em todo pedido ao Supabase. Id fora do formato do proxy vira um novo; IP inválido não vai. */
export function cabecalhosParaOSupabase(
  recebidos: Headers,
  gerarId: () => string,
  ehIp: (valor: string) => boolean,
): Record<string, string> {
  const id = recebidos.get(CABECALHO_REQUEST_ID);
  const saida: Record<string, string> = { [CABECALHO_REQUEST_ID]: id && UUID.test(id) ? id : gerarId() };
  const ip = (recebidos.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";
  if (ip && ehIp(ip)) saida[CABECALHO_IP_DO_CLIENTE] = ip;
  return saida;
}
