import { OFFICES } from '../data/domain';
import { computeMathematicallyDecided } from '../data/electionMath';
import { advanceSim, buildInitialHistory, computeResults, createMockDataProvider } from '../data/mockDataProvider';
import type { SimState } from '../data/mockDataProvider';
import { createTseDataProvider } from '../data/tseDataProvider';
import type {
  CandidateResult,
  DataProvider,
  ElectionResults,
  OfficeKey,
  ProviderStatus,
  Turn,
  VoteBasis,
} from '../data/types';
import {
  createInitialState,
  favKey,
  isFav as storeIsFav,
  loadPersisted,
  officeUfForCurrent,
  persistFavorites,
  persistState,
  toggleFav as storeToggleFav,
} from './store';
import type { AppState } from './store';

export interface DispatchedResults extends ElectionResults {
  providerStatus?: ProviderStatus;
}

/**
 * Recalcula o percentual de cada candidato a partir dos votos brutos, usando
 * `totalValid` (votos válidos) ou `totalApurados` (votos apurados, incluindo
 * brancos/nulos) como base — em vez de confiar no percentual já publicado
 * pelo TSE no arquivo (que vem numa base fixa e não dava pra alternar).
 */
function applyVoteBasis(results: ElectionResults, basis: VoteBasis): ElectionResults {
  const denom = basis === 'total' ? results.totalApurados : results.totalValid;
  if (!denom) return results;
  return {
    ...results,
    candidates: results.candidates.map((c) => ({ ...c, percentage: (c.votes / denom) * 100 })),
  };
}

/**
 * Marca `elected: true` no(s) candidato(s) cuja vitória já está
 * matematicamente garantida, mesmo com a apuração em andamento — nunca uma
 * projeção estatística, só o pior caso matemático (ver `electionMath.ts`).
 * NÃO é uma proclamação oficial (sempre um ato da Justiça Eleitoral, depois
 * da totalização); a UI rotula isso como "Eleito matematicamente (não
 * oficial)".
 *
 * Escopo deliberadamente restrito a Presidente e Governador (`hasRunoff`):
 * são sempre 1 vaga, e o 1º turno tem uma regra clara de maioria absoluta.
 * Senador fica de fora por ora — o número de vagas em disputa varia (o
 * Senado se renova por 1/3 ou 2/3 dependendo do ano) e isso ainda não foi
 * confirmado nos dados reais. Deputado Federal/Estadual nunca entram aqui:
 * são eleitos pelo sistema proporcional (quociente eleitoral/partidário),
 * que depende do total de votos de todos os partidos/coligações — um
 * cálculo muito mais complexo que o de uma corrida majoritária, fora de
 * escopo.
 *
 * Só atua quando o arquivo de acompanhamento já trouxe o eleitorado
 * (`electorateTotal`/`electorateAccountedFor` — ver tseDataProvider.ts);
 * sem isso, não há teto real de votos restantes, e ninguém é marcado.
 */
function applyElectionCertainty(results: ElectionResults, office: OfficeKey, turn: Turn): ElectionResults {
  if (!OFFICES[office].hasRunoff) return results;
  if (results.electorateTotal === undefined || results.electorateAccountedFor === undefined) return results;
  const maxRemainingVotes = results.electorateTotal - results.electorateAccountedFor;
  const decided = computeMathematicallyDecided({
    votes: results.candidates.map((c) => c.votes),
    totalValid: results.totalValid,
    maxRemainingVotes,
    seats: 1,
    requiresAbsoluteMajority: turn === 1,
  });
  if (!decided.some(Boolean)) return results;
  return {
    ...results,
    candidates: results.candidates.map((c, i) => (decided[i] ? { ...c, elected: true } : c)),
  };
}

/**
 * Contexto compartilhado por todos os componentes de UI: estado da aplicação,
 * simulação do modo demonstração e os dois provedores de dados. Substitui o
 * conjunto de variáveis de módulo (closures) do protótipo original.
 */
export class AppContext {
  state: AppState = createInitialState();
  sim: SimState = buildInitialHistory();
  mockProvider: DataProvider = createMockDataProvider(() => this.sim);
  // O 3º argumento é chamado quando uma busca em segundo plano termina (ver
  // tseDataProvider.ts) — sem ele, a tela só refletiria dados novos na
  // próxima renderização disparada por outra coisa (ex.: abrir
  // Configurações), em vez de assim que os dados chegarem.
  tseProvider: DataProvider = createTseDataProvider(
    () => this.state.tseEnv,
    undefined,
    () => this.update(),
  );
  onChange: (() => void) | null = null;

  constructor() {
    loadPersisted(this.state);
  }

  private notify(): void {
    this.onChange?.();
  }

  persist(): void {
    persistState(this.state);
    this.notify();
  }

  update(): void {
    this.notify();
  }

  officeUf(office: OfficeKey): string | null {
    return officeUfForCurrent(this.state, office);
  }

  /** Status real do provedor ativo (mock sempre 'ready'; TSE reflete o catálogo EA11). */
  electionDataStatus(): ProviderStatus {
    const provider = this.state.dataMode === 'tse' ? this.tseProvider : this.mockProvider;
    return provider.getElectionData().status;
  }

  isFav(turn: Turn, office: OfficeKey, uf: string | null, id: string): boolean {
    return storeIsFav(this.state, turn, office, uf, id);
  }

  toggleFav(turn: Turn, office: OfficeKey, uf: string | null, id: string): void {
    storeToggleFav(this.state, turn, office, uf, id);
    this.notify();
  }

  unfavKey(key: string): void {
    const idx = this.state.favorites.indexOf(key);
    if (idx !== -1) {
      this.state.favorites.splice(idx, 1);
      persistFavorites(this.state);
    }
    this.notify();
  }

  favKey(turn: Turn, office: OfficeKey, uf: string | null, id: string): string {
    return favKey(turn, office, uf, id);
  }

  /**
   * Dispatcher único: quem chama dados de resultado nunca sabe se vieram do
   * mock ou do TSE. A UI não deve saber de onde os dados vieram.
   */
  getOfficeResults(office: OfficeKey, uf: string | null, turn: Turn): DispatchedResults {
    if (this.state.dataMode === 'tse') {
      const r = this.tseProvider.getResults(office, uf, turn);
      if (r.status === 'ready' && r.data) {
        return applyElectionCertainty(applyVoteBasis(r.data, this.state.voteBasis), office, turn);
      }
      return { candidates: [], totalValid: 0, totalApurados: 0, providerStatus: r.status };
    }
    return computeResults(office, uf, turn, this.sim.tick, this.sim.t);
  }

  computeResultsAt(office: OfficeKey, uf: string | null, turn: Turn, tick: number, t: number): ElectionResults {
    return computeResults(office, uf, turn, tick, t);
  }

  refreshNow(): void {
    if (this.state.dataMode === 'tse') {
      // Em modo TSE, "atualizar agora" tentaria refazer a busca real; a UI apenas
      // registra a tentativa — o provedor real decide se há dados novos.
      this.state.lastUpdate = Date.now();
      this.notify();
      return;
    }
    advanceSim(this.sim);
    this.state.lastUpdate = Date.now();
    this.notify();
  }

  tick(): void {
    if (this.state.dataMode !== 'tse') advanceSim(this.sim);
    this.state.lastUpdate = Date.now();
    this.notify();
  }
}

export function timeAgoLabel(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 5) return 'Atualizado agora';
  if (s < 60) return `Atualizado há ${s}s`;
  const m = Math.floor(s / 60);
  return `Atualizado há ${m} min`;
}

/** Horário (HH:MM) da última atualização real — `app.state.lastUpdate` é atualizado em ambos os modos (mock e TSE). */
export function lastUpdateWallClock(ms: number): string {
  const d = new Date(ms);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/** Horário (HH:MM) do relógio simulado — só faz sentido no modo demonstração (ver `aboutPage.ts`). */
export function lastUpdateClock(app: AppContext): string {
  const h = app.sim.history[app.sim.history.length - 1];
  return h ? h.label : '19:00';
}

export interface ResolvedFavorite {
  key: string;
  turn: Turn;
  office: OfficeKey;
  uf: string | null;
  candidate: CandidateResult;
}

/**
 * Reconstrói um favorito (guardado como a chave "turno|cargo|uf|id") de volta
 * em cargo/turno/UF/candidato, buscando o candidato atual pelos resultados
 * correntes. Devolve `null` quando o candidato não é (mais) encontrado nessa
 * corrida — ex.: modo TSE sem dados, ou a lista mudou entre atualizações.
 */
export function resolveFavoriteKey(app: AppContext, key: string): ResolvedFavorite | null {
  const parts = key.split('|');
  const turn = Number(parts[0]) as Turn;
  const office = parts[1] as OfficeKey;
  const uf = parts[2] === 'BR' ? null : (parts[2] ?? null);
  const id = parts[3];
  if (!office || !id) return null;
  const results = app.getOfficeResults(office, uf, turn);
  const candidate = results.candidates.find((c) => c.id === id);
  if (!candidate) return null;
  return { key, turn, office, uf, candidate };
}

export { OFFICES };
