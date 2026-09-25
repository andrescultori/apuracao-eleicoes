import { OFFICES } from '../data/domain';
import type { DataMode, OfficeKey, PageKey, ThemeMode, Turn, TseEnv } from '../data/types';

export interface AppState {
  page: PageKey;
  turn: Turn;
  uf: string;
  search: string;
  favorites: string[];
  theme: ThemeMode;
  autoRefresh: boolean;
  refreshInterval: number;
  settingsOpen: boolean;
  lastUpdate: number;
  /** 'mock' (demonstração) | 'tse' (dados oficiais — ver TSE_CONFIG) */
  dataMode: DataMode;
  tseEnv: TseEnv;
  /** Uso interno de render: focar o campo de busca após um input, sem perder o caret. */
  _focusSearch: boolean;
}

const STATE_KEY = 'apuracao2026_state';
const FAVORITES_KEY = 'apuracao2026_favorites';

const PERSISTED_KEYS = [
  'turn',
  'uf',
  'theme',
  'autoRefresh',
  'refreshInterval',
  'page',
  'dataMode',
  'tseEnv',
] as const satisfies readonly (keyof AppState)[];

export function createInitialState(): AppState {
  return {
    page: 'overview',
    turn: 1,
    uf: 'PR',
    search: '',
    favorites: [],
    theme: 'system',
    autoRefresh: true,
    refreshInterval: 30_000,
    settingsOpen: false,
    lastUpdate: Date.now(),
    dataMode: 'mock',
    tseEnv: 'oficial',
    _focusSearch: false,
  };
}

export function loadPersisted(state: AppState): void {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<AppState>;
      for (const key of PERSISTED_KEYS) {
        const value = saved[key];
        if (value !== undefined) {
          (state[key] as unknown) = value;
        }
      }
    }
    const favRaw = localStorage.getItem(FAVORITES_KEY);
    if (favRaw) {
      state.favorites = (JSON.parse(favRaw) as string[]) || [];
    }
  } catch {
    // localStorage indisponível — segue com padrões
  }
}

export function persistState(state: AppState): void {
  try {
    const toSave: Record<string, unknown> = {};
    for (const key of PERSISTED_KEYS) toSave[key] = state[key];
    localStorage.setItem(STATE_KEY, JSON.stringify(toSave));
  } catch {
    // localStorage indisponível — mudanças não são persistidas nesta sessão
  }
}

export function persistFavorites(state: AppState): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites));
  } catch {
    // localStorage indisponível
  }
}

export function favKey(turn: Turn, office: OfficeKey, uf: string | null, id: string): string {
  const scope = OFFICES[office].scope === 'national' ? 'BR' : uf;
  return `${turn}|${office}|${scope}|${id}`;
}

export function isFav(state: AppState, turn: Turn, office: OfficeKey, uf: string | null, id: string): boolean {
  return state.favorites.includes(favKey(turn, office, uf, id));
}

export function toggleFav(state: AppState, turn: Turn, office: OfficeKey, uf: string | null, id: string): void {
  const k = favKey(turn, office, uf, id);
  const idx = state.favorites.indexOf(k);
  if (idx === -1) state.favorites.push(k);
  else state.favorites.splice(idx, 1);
  persistFavorites(state);
}

export function officeUfForCurrent(state: AppState, office: OfficeKey): string | null {
  return OFFICES[office].scope === 'national' ? null : state.uf;
}
