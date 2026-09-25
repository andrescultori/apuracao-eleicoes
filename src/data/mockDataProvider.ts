import { clamp, hashString, mulberry32, randFor } from '../util';
import { OFFICES, TURNOUT, UFS, UF_MAP, VALID_RATIO, PARTIES, PARTY_BASE } from './domain';
import { letterSeq } from '../util';
import type {
  Candidate,
  CandidateResult,
  DataProvider,
  ElectionDataStatus,
  ElectionResults,
  HistoryPoint,
  OfficeKey,
  ProviderResult,
  Turn,
} from './types';

/**
 * Gerador determinístico de dados fictícios (modo "Demonstração"), usado quando
 * o app não está configurado para consumir os arquivos oficiais do TSE, ou como
 * fallback padrão para nunca deixar a interface vazia/quebrada.
 */

const candidateListCache = new Map<string, Candidate[]>();

export function getScopeElectorate(office: OfficeKey, uf: string | null): number {
  if (OFFICES[office].scope === 'national') {
    const total = UFS.reduce((sum, u) => sum + u.peso, 0);
    return total * 1_000_000;
  }
  return (uf && UF_MAP[uf] ? UF_MAP[uf].peso : 1) * 1_000_000;
}

export function getScopeSections(office: OfficeKey, uf: string | null): number {
  return Math.round(getScopeElectorate(office, uf) / 320);
}

export function generateCandidateList(office: OfficeKey, uf: string | null, turn: Turn): Candidate[] {
  const scope = OFFICES[office].scope === 'national' ? 'BR' : (uf ?? '');
  const key = `${office}|${scope}|t${turn}`;
  const cached = candidateListCache.get(key);
  if (cached) return cached;

  let list: Candidate[];

  if (turn === 2) {
    if (!OFFICES[office].hasRunoff) {
      candidateListCache.set(key, []);
      return [];
    }
    const t1 = generateCandidateList(office, uf, 1)
      .slice()
      .sort((a, b) => b.finalShare - a.finalShare);
    const top2 = t1.slice(0, 2);
    const rng = mulberry32(hashString(key + '|runoff'));
    const split = 0.5 + (rng() - 0.5) * 0.16; // entre ~42% e ~58%
    list = [
      { ...top2[0]!, finalShare: split },
      { ...top2[1]!, finalShare: 1 - split },
    ];
  } else {
    const rng2 = mulberry32(hashString(key));
    const cfg = OFFICES[office];
    const count = cfg.countRange[0] + Math.floor(rng2() * (cfg.countRange[1] - cfg.countRange[0] + 1));
    const weights: number[] = [];
    let sum = 0;
    for (let i = 0; i < count; i++) {
      const w = -Math.log(Math.max(0.0001, rng2())) + 0.15;
      weights.push(w);
      sum += w;
    }
    const partySerial: Record<string, number> = {};
    list = [];
    for (let j = 0; j < count; j++) {
      const party = PARTIES[Math.floor(rng2() * PARTIES.length)]!;
      partySerial[party] = (partySerial[party] || 0) + 1;
      const base = PARTY_BASE[party]!;
      const digits = cfg.digits;
      let numStr = String(base) + String(partySerial[party]).padStart(2, '0');
      numStr = numStr.length >= digits ? numStr.slice(0, digits) : numStr.padEnd(digits, '0');
      list.push({
        id: 'c' + j,
        name: 'Candidato ' + letterSeq(j),
        ballotName: 'Cand. ' + letterSeq(j),
        number: numStr,
        party,
        state: scope,
        office,
        finalShare: weights[j]! / sum,
      });
    }
  }
  candidateListCache.set(key, list);
  return list;
}

/** Percentuais/votos em um dado ponto da apuração simulada (por tickIndex, t). */
export function computeResults(
  office: OfficeKey,
  uf: string | null,
  turn: Turn,
  tickIndex: number,
  t: number,
): ElectionResults {
  const candidates = generateCandidateList(office, uf, turn);
  if (!candidates.length) return { candidates: [], totalValid: 0, totalApurados: 0 };

  const scope = OFFICES[office].scope === 'national' ? 'BR' : (uf ?? '');
  const electorate = getScopeElectorate(office, uf);
  const totalApurados = electorate * TURNOUT * t;
  const totalValid = totalApurados * VALID_RATIO[office];

  const amp = 0.36 * (1 - t);
  const raws = candidates.map((c) => {
    const seed = `${office}|${scope}|t${turn}|${c.id}|tick${tickIndex}`;
    const noise = (randFor(seed) - 0.5) * 2 * amp;
    return Math.max(0.002, c.finalShare + noise);
  });
  const rawSum = raws.reduce((a, b) => a + b, 0);
  const pcts = raws.map((r) => (r / rawSum) * 100);

  const results: CandidateResult[] = candidates.map((c, idx) => {
    const pct = pcts[idx]!;
    const votes = Math.round((pct / 100) * totalValid);
    return { ...c, votes, percentage: pct, position: 0 };
  });
  results.sort((a, b) => b.votes - a.votes);
  results.forEach((r, i) => {
    r.position = i + 1;
  });

  return { candidates: results, totalValid, totalApurados };
}

export interface SimState {
  tick: number;
  t: number;
  history: HistoryPoint[];
  fetchError: boolean;
}

export function buildInitialHistory(): SimState {
  const steps = [0.08, 0.19, 0.3, 0.42];
  const startH = 19;
  const startM = 0;
  const history = steps.map((tv, i) => {
    const mins = startM + i * 15;
    const hh = startH + Math.floor(mins / 60);
    const mm = mins % 60;
    return {
      tick: i,
      t: tv,
      label: String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'),
    };
  });
  return {
    tick: steps.length - 1,
    t: steps[steps.length - 1]!,
    history,
    fetchError: false,
  };
}

export function advanceSim(sim: SimState): { advanced: boolean; error: boolean } {
  if (sim.t >= 1) {
    sim.fetchError = false;
    return { advanced: false, error: false };
  }
  const errRoll = randFor('err|' + (sim.tick + 1) + '|' + Date.now());
  if (errRoll < 0.1) {
    sim.fetchError = true;
    return { advanced: false, error: true };
  }
  sim.fetchError = false;
  const stepRng = mulberry32(hashString('step|' + (sim.tick + 1)));
  const step = 0.05 + stepRng() * 0.09;
  const newT = clamp(sim.t + step, 0, 1);
  sim.tick += 1;
  const startTotalMin = 19 * 60;
  const mins = startTotalMin + sim.history.length * 15;
  const hh = Math.floor(mins / 60) % 24;
  const mm = mins % 60;
  sim.t = newT;
  sim.history.push({
    tick: sim.tick,
    t: newT,
    label: String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'),
  });
  return { advanced: true, error: false };
}

export interface StatusInfo {
  key: 'aguardando' | 'andamento' | 'avancada' | 'final';
  label: string;
}

export function statusForT(t: number): StatusInfo {
  if (t <= 0.01) return { key: 'aguardando', label: 'Aguardando início' };
  if (t < 0.65) return { key: 'andamento', label: 'Apuração em andamento' };
  if (t < 1) return { key: 'avancada', label: 'Apuração avançada' };
  return { key: 'final', label: 'Totalização final' };
}

/**
 * Adapta o gerador determinístico acima à interface comum `DataProvider`,
 * para que o restante do app possa tratar mock e TSE de forma intercambiável.
 */
export function createMockDataProvider(getSim: () => SimState): DataProvider {
  return {
    getElectionData(): ElectionDataStatus {
      return { status: 'ready' };
    },
    getResults(office: OfficeKey, uf: string | null, turn: Turn): ProviderResult {
      const sim = getSim();
      const data = computeResults(office, uf, turn, sim.tick, sim.t);
      return { status: 'ready', data, fetchedAt: Date.now() };
    },
    getCandidates(office: OfficeKey, uf: string | null, turn: Turn): ProviderResult {
      return this.getResults(office, uf, turn);
    },
    getLastUpdate(): number | null {
      const sim = getSim();
      return sim.history[sim.history.length - 1]?.tick ?? null;
    },
  };
}
