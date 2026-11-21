import "server-only";
/**
 * Simulador de agenda externa: OAuth fictício e eventos determinísticos, com cursor incremental.
 * A tela de Integrações funciona ponta a ponta sem conta Google/Microsoft.
 */
import { falhaProvedor, okProvedor, type ResultadoProvedor } from "../comum/resultado-provedor";
import type { AgendaExterna, EventoOcupado, PaginaEventos, ProvedorAgenda, ProvedorAgendaId, Tokens } from "./porta";

export class SimuladorAgenda implements ProvedorAgenda {
  private eventos: EventoOcupado[] = [];
  private versaoCursor = 0;
  private alteradosDesde = new Map<number, Set<string>>();
  readonly revogados: string[] = [];

  constructor(
    readonly provedor: ProvedorAgendaId,
    private readonly agora: () => Date = () => new Date(),
  ) {}

  urlAutorizacao(p: { state: string; codeChallenge: string; redirectUri: string }): string {
    const u = new URL(p.redirectUri);
    u.searchParams.set("code", `sim_code_${this.provedor}`);
    u.searchParams.set("state", p.state);
    return u.toString();
  }

  async trocarCodigo(p: { code: string; codeVerifier: string }): Promise<ResultadoProvedor<Tokens>> {
    if (p.code !== `sim_code_${this.provedor}` || p.codeVerifier.length < 43)
      return falhaProvedor("permanente", "codigo_invalido", "simulador: código inválido");
    return okProvedor({
      accessToken: "sim_access",
      refreshToken: "sim_refresh",
      expiraEm: new Date(this.agora().getTime() + 3_600_000),
    });
  }

  async renovar(refreshToken: string): Promise<ResultadoProvedor<Tokens>> {
    if (this.revogados.includes(refreshToken))
      return falhaProvedor("configuracao", "token_revogado", "simulador: conexão revogada");
    return okProvedor({
      accessToken: "sim_access",
      refreshToken,
      expiraEm: new Date(this.agora().getTime() + 3_600_000),
    });
  }

  async listarAgendas(): Promise<ResultadoProvedor<readonly AgendaExterna[]>> {
    return okProvedor([{ id: "principal", principal: true }]);
  }

  /** Para testes: cria, muda ou remove um evento e marca a mudança no cursor. */
  registrar(evento: EventoOcupado): void {
    this.eventos = [...this.eventos.filter((e) => e.idExterno !== evento.idExterno), evento];
    this.versaoCursor++;
    this.alteradosDesde.set(this.versaoCursor, new Set([evento.idExterno]));
  }

  async listarOcupados(p: { de: Date; ate: Date; cursor?: string }): Promise<ResultadoProvedor<PaginaEventos>> {
    const cursorAtual = `sim_cursor_${this.versaoCursor}`;
    if (!p.cursor) {
      const janela = this.eventos.filter((e) => !e.removido && e.fim > p.de && e.inicio < p.ate);
      return okProvedor({ eventos: janela, cursor: cursorAtual });
    }
    const desde = Number(p.cursor.replace("sim_cursor_", ""));
    if (Number.isNaN(desde)) return falhaProvedor("permanente", "cursor_invalido", "simulador: cursor inválido");
    const ids = new Set<string>();
    for (let v = desde + 1; v <= this.versaoCursor; v++) for (const id of this.alteradosDesde.get(v) ?? []) ids.add(id);
    return okProvedor({ eventos: this.eventos.filter((e) => ids.has(e.idExterno)), cursor: cursorAtual });
  }

  async revogar(token: string): Promise<ResultadoProvedor<void>> {
    this.revogados.push(token);
    return okProvedor(undefined);
  }
}
