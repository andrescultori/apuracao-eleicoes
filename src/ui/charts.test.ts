import { describe, expect, it } from 'vitest';
import type { CandidateResult, DataProvider, ElectionDataStatus, ProviderResult } from '../data/types';
import { AppContext } from '../state/appContext';
import { EvolutionChart } from './charts';

/** `votes` casa com `percentage` sobre uma base de 100 (ver `totalValid: 100` em `sequencedProvider`) — `applyVoteBasis` recalcula o percentual a partir de votes/totalValid, então os dois precisam ser consistentes. */
function fakeCandidate(id: string, name: string, percentage: number): CandidateResult {
  return {
    id,
    name,
    ballotName: name,
    number: id,
    party: 'XYZ',
    state: 'BR',
    office: 'presidente',
    finalShare: 0,
    percentage,
    votes: percentage,
    position: 1,
  };
}

/**
 * Provedor fake cujo resultado muda a cada chamada, seguindo a lista
 * `snapshots` — simula o TSE publicando novos dados ao longo do tempo
 * (diferente dos outros testes com provedor fake, que devolvem sempre o
 * mesmo resultado).
 */
function sequencedProvider(snapshots: { fetchedAt: number; candidates: CandidateResult[] }[]): DataProvider {
  let call = 0;
  const next = (): ProviderResult => {
    const snap = snapshots[Math.min(call, snapshots.length - 1)]!;
    call++;
    return {
      status: 'ready',
      data: { candidates: snap.candidates, totalValid: 100, totalApurados: 100 },
      fetchedAt: snap.fetchedAt,
    };
  };
  return {
    getElectionData: (): ElectionDataStatus => ({ status: 'ready' }),
    getResults: next,
    getCandidates: next,
    getLastUpdate: () => null,
  };
}

describe('EvolutionChart — modo TSE', () => {
  it('mostra aviso de histórico insuficiente com menos de 2 pontos', () => {
    const app = new AppContext();
    app.state.dataMode = 'tse';
    app.tseProvider = sequencedProvider([{ fetchedAt: 1000, candidates: [fakeCandidate('a', 'Candidato A', 50)] }]);
    app.getOfficeResults('presidente', null, 1); // 1º ponto registrado
    const html = EvolutionChart(app, 'presidente', 1, null);
    expect(html).toContain('Ainda não há pontos suficientes');
    expect(html).not.toContain('<svg');
  });

  it('desenha o gráfico real a partir do histórico, depois de 2+ buscas espaçadas pelo intervalo mínimo', () => {
    const app = new AppContext();
    app.state.dataMode = 'tse';
    const FIVE_MIN = 5 * 60 * 1000;
    const T0 = 1_700_000_000_000; // timestamp realista (Date.now() nunca é 0)
    app.tseProvider = sequencedProvider([
      { fetchedAt: T0, candidates: [fakeCandidate('a', 'Candidato A', 40)] },
      { fetchedAt: T0 + FIVE_MIN, candidates: [fakeCandidate('a', 'Candidato A', 55)] },
    ]);
    app.getOfficeResults('presidente', null, 1);
    app.getOfficeResults('presidente', null, 1);
    const history = app.getResultsHistory('presidente', null, 1);
    expect(history).toHaveLength(2);
    expect(history[0]?.candidates[0]?.percentage).toBeCloseTo(40);
    expect(history[1]?.candidates[0]?.percentage).toBeCloseTo(55);

    const html = EvolutionChart(app, 'presidente', 1, null);
    expect(html).toContain('<svg');
    expect(html).toContain('Candidato A');
  });

  it('não duplica um ponto do histórico quando getOfficeResults é chamado de novo com o mesmo fetchedAt (um render sem dado novo)', () => {
    const app = new AppContext();
    app.state.dataMode = 'tse';
    app.tseProvider = sequencedProvider([{ fetchedAt: 1000, candidates: [fakeCandidate('a', 'Candidato A', 40)] }]);
    // Simula múltiplos renders entre buscas reais — fetchedAt não muda.
    app.getOfficeResults('presidente', null, 1);
    app.getOfficeResults('presidente', null, 1);
    app.getOfficeResults('presidente', null, 1);
    expect(app.getResultsHistory('presidente', null, 1)).toHaveLength(1);
  });

  it('não registra um ponto novo antes do intervalo mínimo (5 min) — eixo X largo em vez de minuto a minuto', () => {
    const app = new AppContext();
    app.state.dataMode = 'tse';
    const T0 = 1_700_000_000_000; // timestamp realista (Date.now() nunca é 0)
    app.tseProvider = sequencedProvider([
      { fetchedAt: T0, candidates: [fakeCandidate('a', 'Candidato A', 40)] },
      // Autoatualização de 30s (o mínimo configurável) chegando com dado
      // novo bem antes dos 5 min — não deveria virar um ponto novo.
      { fetchedAt: T0 + 30_000, candidates: [fakeCandidate('a', 'Candidato A', 41)] },
      { fetchedAt: T0 + 60_000, candidates: [fakeCandidate('a', 'Candidato A', 42)] },
    ]);
    app.getOfficeResults('presidente', null, 1);
    app.getOfficeResults('presidente', null, 1);
    app.getOfficeResults('presidente', null, 1);
    expect(app.getResultsHistory('presidente', null, 1)).toHaveLength(1);
  });
});
