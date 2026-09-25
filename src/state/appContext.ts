import { OFFICES } from '../data/domain';
import { advanceSim, buildInitialHistory, computeResults, createMockDataProvider } from '../data/mockDataProvider';
import type { SimState } from '../data/mockDataProvider';
import { createTseDataProvider } from '../data/tseDataProvider';
import type { DataProvider, ElectionResults, OfficeKey, ProviderStatus, Turn } from '../data/types';
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
 * Contexto compartilhado por todos os componentes de UI: estado da aplicação,
 * simulação do modo demonstração e os dois provedores de dados. Substitui o
 * conjunto de variáveis de módulo (closures) do protótipo original.
 */
export class AppContext {
  state: AppState = createInitialState();
  sim: SimState = buildInitialHistory();
  mockProvider: DataProvider = createMockDataProvider(() => this.sim);
  tseProvider: DataProvider = createTseDataProvider(() => this.state.tseEnv);
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
      if (r.status === 'ready' && r.data) return r.data;
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

export function lastUpdateClock(app: AppContext): string {
  const h = app.sim.history[app.sim.history.length - 1];
  return h ? h.label : '19:00';
}

export { OFFICES };
