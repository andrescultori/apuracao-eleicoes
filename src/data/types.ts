export type OfficeKey = 'presidente' | 'governador' | 'senador' | 'deputadoFederal' | 'deputadoEstadual';

export type Turn = 1 | 2;

export type OfficeScope = 'national' | 'uf';

export interface Uf {
  sigla: string;
  nome: string;
  /** Peso relativo do eleitorado, usado apenas para gerar dados fictícios no modo demonstração. */
  peso: number;
}

export interface OfficeConfig {
  label: string;
  short: string;
  scope: OfficeScope;
  hasRunoff: boolean;
  digits: number;
  countRange: [number, number];
}

export interface Candidate {
  id: string;
  name: string;
  ballotName: string;
  number: string;
  party: string;
  /** Sigla da UF, ou 'BR' para corridas de abrangência nacional. */
  state: string;
  office: OfficeKey;
  /** Participação final de votos usada apenas pelo gerador de dados fictícios. */
  finalShare: number;
}

export interface CandidateResult extends Candidate {
  votes: number;
  percentage: number;
  position: number;
}

export interface ElectionResults {
  candidates: CandidateResult[];
  totalValid: number;
  totalApurados: number;
}

/**
 * Estado de uma consulta a um provedor de dados.
 * 'unconfigured': o provedor não tem como buscar esses dados ainda (ex.: path oficial não confirmado).
 * 'loading': requisição em andamento.
 * 'error': falha ao buscar ou verificar os dados (nunca exibir dados não verificados).
 * 'ready': dados disponíveis e verificados.
 */
export type ProviderStatus = 'unconfigured' | 'loading' | 'error' | 'ready';

export interface ProviderResult {
  status: ProviderStatus;
  data: ElectionResults | null;
  fetchedAt: number | null;
}

export interface ElectionDataStatus {
  status: ProviderStatus;
}

/**
 * Interface comum implementada por mockDataProvider e tseDataProvider.
 * A UI nunca deve saber de onde os dados vieram.
 */
export interface DataProvider {
  getElectionData(): ElectionDataStatus;
  getCandidates(office: OfficeKey, uf: string | null, turn: Turn): ProviderResult;
  getResults(office: OfficeKey, uf: string | null, turn: Turn): ProviderResult;
  getLastUpdate(): number | null;
}

export type ThemeMode = 'light' | 'dark' | 'system';
export type DataMode = 'mock' | 'tse';
export type TseEnv = 'oficial' | 'simulado';
export type PageKey = 'overview' | 'favorites' | 'about' | OfficeKey;

export interface HistoryPoint {
  tick: number;
  t: number;
  label: string;
}
