import { describe, expect, it } from 'vitest';
import type { DataProvider, ElectionDataStatus, ProviderResult } from '../data/types';
import { AppContext } from './appContext';

function fakeReadyProvider(): DataProvider {
  const result: ProviderResult = {
    status: 'ready',
    fetchedAt: Date.now(),
    data: {
      totalApurados: 1000,
      totalValid: 800,
      candidates: [
        {
          id: '1',
          name: 'Fulano',
          ballotName: 'FULANO',
          number: '11',
          party: 'AAA',
          state: 'BR',
          office: 'presidente',
          finalShare: 0,
          votes: 400,
          percentage: 999, // valor absurdo de propósito — deve ser sempre recalculado, nunca usado como veio
          position: 1,
        },
      ],
    },
  };
  return {
    getElectionData: (): ElectionDataStatus => ({ status: 'ready' }),
    getResults: () => result,
    getCandidates: () => result,
    getLastUpdate: () => Date.now(),
  };
}

describe('AppContext.getOfficeResults — base do percentual (voteBasis) no modo TSE', () => {
  it('calcula o percentual sobre votos válidos por padrão', () => {
    const app = new AppContext();
    app.tseProvider = fakeReadyProvider();
    app.state.dataMode = 'tse';
    app.state.voteBasis = 'valid';

    const results = app.getOfficeResults('presidente', null, 1);
    // 400 votos / 800 válidos = 50%, não os 999 (absurdos) que vieram do provedor.
    expect(results.candidates[0]?.percentage).toBeCloseTo(50, 6);
  });

  it('recalcula sobre votos totais quando voteBasis é "total"', () => {
    const app = new AppContext();
    app.tseProvider = fakeReadyProvider();
    app.state.dataMode = 'tse';
    app.state.voteBasis = 'total';

    const results = app.getOfficeResults('presidente', null, 1);
    // 400 votos / 1000 apurados = 40%.
    expect(results.candidates[0]?.percentage).toBeCloseTo(40, 6);
  });
});
