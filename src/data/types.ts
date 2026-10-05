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
  /**
   * `true` quando a vitória já está matematicamente garantida, mesmo no pior
   * caso para os votos que ainda faltam apurar (ver `electionMath.ts`) — não
   * é uma projeção estatística nem uma proclamação oficial. Só calculado no
   * modo TSE, para Presidente, Governador e Senador (ver `appContext.ts`).
   */
  elected?: boolean;
  /**
   * `true` quando a vaga no 2º turno já está matematicamente garantida (um
   * dos 2 primeiros colocados, mesmo no pior caso) — só no 1º turno de
   * Presidente/Governador, e só enquanto ninguém tiver maioria absoluta
   * garantida ainda (se alguém já tem `elected: true`, a corrida se decide
   * no 1º turno — não há 2º turno pra confirmar vaga nenhuma). Mesma
   * ressalva de `elected`: nunca uma projeção, nunca oficial.
   */
  confirmedRunoff?: boolean;
}

export interface ElectionResults {
  candidates: CandidateResult[];
  totalValid: number;
  totalApurados: number;
  /**
   * Seções totalizadas — só disponível no modo TSE, quando o arquivo de
   * acompanhamento (EA14, tipo "ab") já foi obtido e verificado (ver
   * tseDataProvider.ts). `undefined` quando ainda não disponível; a UI mostra
   * "—" nesse caso, nunca um 0% inventado.
   */
  sectionsTotal?: number;
  sectionsCounted?: number;
  /**
   * Percentual de seções totalizadas, já calculado pelo próprio TSE (campo
   * `pstn` do EA14) — usado para exibição em vez de `sectionsCounted /
   * sectionsTotal * 100`: o valor publicado pelo TSE não bate com essa conta
   * simples (confirmado por divergência real entre o app e o site oficial),
   * então a % exibida precisa ser a que o TSE já calculou, não uma
   * recalculada aqui. `sectionsTotal`/`sectionsCounted` continuam existindo
   * para mostrar as contagens brutas.
   */
  sectionsPercent?: number;
  /**
   * Eleitorado total do escopo (UF ou Brasil) e quanto dele já foi
   * contabilizado (comparecimento + abstenção) nas seções já totalizadas —
   * vem do mesmo arquivo de acompanhamento que `sectionsTotal`/`sectionsCounted`.
   * Usado só para o cálculo de "eleito matematicamente" (ver
   * `electionMath.ts`): a diferença entre os dois é o teto de votos que ainda
   * podem aparecer, no pior caso. `undefined` quando ainda não disponível.
   */
  electorateTotal?: number;
  electorateAccountedFor?: number;
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

/**
 * Base usada para calcular o percentual de cada candidato, no modo TSE:
 * 'valid' = sobre votos válidos (exclui brancos/nulos, convenção usual de
 * apuração no Brasil); 'total' = sobre votos apurados (inclui brancos/nulos).
 * Só afeta o modo TSE — o modo demonstração já usa sua própria simulação.
 */
export type VoteBasis = 'valid' | 'total';

export interface HistoryPoint {
  tick: number;
  t: number;
  label: string;
}
