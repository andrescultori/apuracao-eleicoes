import { OFFICES, SENADO_SEATS_2026 } from '../data/domain';
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
  loadResultsHistory,
  officeUfForCurrent,
  persistFavorites,
  persistResultsHistory,
  persistState,
  toggleFav as storeToggleFav,
} from './store';
import type { AppState, ResultsHistoryPoint } from './store';

export type { ResultsHistoryPoint } from './store';

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
 * Compara o último ponto do histórico com o resultado atual — usado por
 * `recordHistorySnapshot` pra nunca registrar um ponto novo quando nada
 * realmente mudou (ver nota lá sobre o TSE reemitindo o mesmo arquivo com um
 * `dg`/`hg` novo numa apuração já encerrada). Tolerância pequena só pra
 * ruído de ponto flutuante — nunca o bastante pra mascarar uma mudança real
 * (percentuais do TSE já vêm com várias casas decimais).
 */
function percentagesUnchanged(last: ResultsHistoryPoint, results: ElectionResults): boolean {
  if (last.candidates.length !== results.candidates.length) return false;
  const lastById = new Map(last.candidates.map((c) => [c.id, c.percentage]));
  return results.candidates.every((c) => {
    const prev = lastById.get(c.id);
    return prev !== undefined && Math.abs(prev - c.percentage) < 1e-9;
  });
}

/**
 * Quantas vagas entram no cálculo de certeza matemática pra um cargo/turno —
 * `null` quando o cargo fica de fora (ver `applyElectionCertainty`).
 *
 * Presidente/Governador: sempre 1 vaga (`hasRunoff` — maioria absoluta no 1º
 * turno, simples no 2º). Senador: `SENADO_SEATS_2026` (2, fixo neste ciclo —
 * ver nota em domain.ts), só no 1º turno (Senador não tem 2º turno — já
 * confirmado por `OFFICES.senador.hasRunoff === false`).
 *
 * Deputado Federal/Estadual ficam de fora — não por serem proporcionais
 * complexos, mas por uma lacuna de dado real: ao contrário de Senador (2
 * vagas fixas por lei), o número de vagas de Deputado varia por UF (depende
 * de população/censo) e NÃO foi confirmado em nenhum arquivo real do TSE
 * observado até agora (nem no catálogo EA11, nem em uma amostra real do
 * EA20 de Deputado — só Presidente foi confirmado ao vivo). Sem esse número
 * por UF, não dá pra calcular quociente eleitoral/partidário com segurança;
 * inventar ou aproximar de memória arriscaria declarar a pessoa errada como
 * eleita, o que é pior que simplesmente não mostrar nada.
 */
function seatsForCertainty(office: OfficeKey, turn: Turn): number | null {
  if (OFFICES[office].hasRunoff) return 1;
  if (office === 'senador' && turn === 1) return SENADO_SEATS_2026;
  return null;
}

/**
 * Marca `elected: true` no(s) candidato(s) cuja vitória já está
 * matematicamente garantida, mesmo com a apuração em andamento — nunca uma
 * projeção estatística, só o pior caso matemático (ver `electionMath.ts`).
 * NÃO é uma proclamação oficial (sempre um ato da Justiça Eleitoral, depois
 * da totalização); a UI rotula isso como "Eleito matematicamente (não
 * oficial)".
 *
 * Escopo (ver `seatsForCertainty`): Presidente, Governador e Senador — nunca
 * Deputado Federal/Estadual (proporcional, e falta um dado essencial — o
 * número de vagas por UF — pra calcular com segurança).
 *
 * No 1º turno de Presidente/Governador, também marca `confirmedRunoff: true`
 * em quem já tem vaga garantida no 2º turno (um dos 2 primeiros colocados,
 * mesmo no pior caso restante) — mesma conta usada pro Senado (`seats: 2`,
 * maioria simples), só que aqui é sobre quem AVANÇA, não quem já venceu.
 * Only calculado enquanto ninguém tem `elected: true` ainda: se alguém já
 * tem maioria absoluta garantida, a corrida se decide no 1º turno — não faz
 * sentido "confirmar" uma vaga de 2º turno que não vai existir.
 *
 * Só atua quando o arquivo de acompanhamento já trouxe o eleitorado
 * (`electorateTotal`/`electorateAccountedFor` — ver tseDataProvider.ts);
 * sem isso, não há teto real de votos restantes, e ninguém é marcado.
 */
function applyElectionCertainty(results: ElectionResults, office: OfficeKey, turn: Turn): ElectionResults {
  const seats = seatsForCertainty(office, turn);
  if (seats === null) return results;
  if (results.electorateTotal === undefined || results.electorateAccountedFor === undefined) return results;
  const maxRemainingVotes = results.electorateTotal - results.electorateAccountedFor;
  const votes = results.candidates.map((c) => c.votes);
  const requiresAbsoluteMajority = OFFICES[office].hasRunoff && turn === 1;

  const decided = computeMathematicallyDecided({
    votes,
    totalValid: results.totalValid,
    maxRemainingVotes,
    seats,
    requiresAbsoluteMajority,
  });

  let runoffConfirmed: boolean[] | null = null;
  if (requiresAbsoluteMajority && !decided.some(Boolean)) {
    runoffConfirmed = computeMathematicallyDecided({
      votes,
      totalValid: results.totalValid,
      maxRemainingVotes,
      seats: 2,
      requiresAbsoluteMajority: false,
    });
  }

  if (!decided.some(Boolean) && !runoffConfirmed?.some(Boolean)) return results;
  return {
    ...results,
    candidates: results.candidates.map((c, i) => ({
      ...c,
      ...(decided[i] ? { elected: true } : {}),
      ...(runoffConfirmed?.[i] ? { confirmedRunoff: true } : {}),
    })),
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
  /**
   * Histórico de percentuais por corrida (modo TSE), usado pelo gráfico de
   * evolução — diferente do modo demonstração, que já tem seu próprio
   * histórico simulado (`sim.history`), o modo TSE não tinha nenhum: o
   * gráfico só mostrava um aviso de "ainda não implementado". Um ponto novo
   * é registrado sempre que uma busca de verdade chega com dados (nunca a
   * cada render — `fetchedAt` muda só quando o provedor efetivamente buscou
   * de novo, ver `recordHistorySnapshot`). Persistido (ver `loadResultsHistory`/
   * `persistResultsHistory` em store.ts), pra sobreviver a um recarregamento
   * de página (navegar dentro do app não recria o `AppContext` — só um F5 ou
   * abrir de novo numa aba nova).
   */
  private resultsHistory: Map<string, ResultsHistoryPoint[]> = new Map(Object.entries(loadResultsHistory()));
  // Um ponto a cada busca de verdade (a cada tick da autoatualização, que
  // pode ser configurada pra até 10s) deixava o eixo X do gráfico de
  // evolução cobrindo só alguns minutos — perto demais pra enxergar
  // variação real (percentual de votos não muda muito de minuto a minuto).
  // Espaçar os pontos nesse intervalo mínimo faz o eixo cobrir um período
  // maior à medida que a sessão continua. Um valor usado antes (5 min) era
  // tecnicamente melhor pra isso, mas na prática deixava o gráfico preso em
  // "ainda não há pontos suficientes" por tempo longo demais pra alguém
  // esperar — 1 min é um meio-termo: o gráfico aparece bem mais rápido, e
  // ainda assim cresce bem além de "minuto a minuto" numa sessão longa.
  private static readonly MIN_HISTORY_INTERVAL_MS = 60 * 1000;
  // Antes 180 (3h a 1 pt/min) — descartava os pontos mais antigos bem antes
  // do fim da apuração numa eleição que começa às 17h e pode passar de 5h,
  // fazendo o eixo X do gráfico de evolução "esquecer" o início. 720 (12h a
  // 1 pt/min) cobre a apuração inteira de uma eleição geral com folga, sem
  // custo real: cada ponto é só alguns números por candidato, e o eixo X só
  // mostra um punhado de rótulos (ver thinning em `renderEvolutionSvg`,
  // independente da quantidade de pontos).
  private static readonly MAX_HISTORY_POINTS = 720;

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
        const results = applyElectionCertainty(applyVoteBasis(r.data, this.state.voteBasis), office, turn);
        if (r.fetchedAt) this.recordHistorySnapshot(office, uf, turn, r.fetchedAt, results);
        return results;
      }
      return { candidates: [], totalValid: 0, totalApurados: 0, providerStatus: r.status };
    }
    return computeResults(office, uf, turn, this.sim.tick, this.sim.t);
  }

  computeResultsAt(office: OfficeKey, uf: string | null, turn: Turn, tick: number, t: number): ElectionResults {
    return computeResults(office, uf, turn, tick, t);
  }

  private historyKey(office: OfficeKey, uf: string | null, turn: Turn): string {
    return `${office}|${uf ?? 'BR'}|${turn}`;
  }

  private recordHistorySnapshot(
    office: OfficeKey,
    uf: string | null,
    turn: Turn,
    fetchedAt: number,
    results: ElectionResults,
  ): void {
    const key = this.historyKey(office, uf, turn);
    const list = this.resultsHistory.get(key) ?? [];
    const last = list[list.length - 1];
    // `getOfficeResults` é chamado a cada render, não só quando dados novos
    // chegam — sem isso, cada render repetiria o último ponto.
    //
    // Bug real: com uma apuração já encerrada, o TSE continua reemitindo o
    // mesmo arquivo de tempos em tempos (mesmo `dg`/`hg` de geração mudando,
    // ver tseDataProvider.ts) — o número em si nunca muda, só o timestamp.
    // Confiar só no tempo decorrido (como antes) criava um "gráfico" falso,
    // de pontos idênticos espaçados no tempo, parecendo evolução onde não
    // há nenhuma. Por isso o percentual tem que ter mudado de verdade — só
    // aí o intervalo mínimo (MIN_HISTORY_INTERVAL_MS) entra pra limitar a
    // densidade de pontos de uma apuração que está, de fato, mudando.
    if (last && percentagesUnchanged(last, results)) return;
    if (last && fetchedAt - last.fetchedAt < AppContext.MIN_HISTORY_INTERVAL_MS) return;
    list.push({
      fetchedAt,
      candidates: results.candidates.map((c) => ({ id: c.id, ballotName: c.ballotName, percentage: c.percentage })),
    });
    if (list.length > AppContext.MAX_HISTORY_POINTS) list.shift();
    this.resultsHistory.set(key, list);
    persistResultsHistory(Object.fromEntries(this.resultsHistory));
  }

  /** Histórico de percentuais já registrado (modo TSE) para uma corrida — ver `EvolutionChart`. */
  getResultsHistory(office: OfficeKey, uf: string | null, turn: Turn): ResultsHistoryPoint[] {
    return this.resultsHistory.get(this.historyKey(office, uf, turn)) ?? [];
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
  if (m < 60) return `Atualizado há ${m} min`;
  // Além de minutos — acontece com `tseLastUpdate` em aboutPage.ts, que
  // agora usa o horário real de geração do arquivo do TSE (ver
  // `parseGenerationTimestamp` em tseDataProvider.ts) em vez da hora local:
  // consultar uma apuração já encerrada (ex.: no dia seguinte) pode
  // facilmente passar de 1h.
  const h = Math.floor(m / 60);
  if (h < 48) return `Atualizado há ${h}h`;
  const d = Math.floor(h / 24);
  return `Atualizado há ${d} dias`;
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
