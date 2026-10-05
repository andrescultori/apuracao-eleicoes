import { describe, expect, it } from 'vitest';
import type { CandidateResult, DataProvider, ElectionDataStatus, OfficeKey, ProviderResult } from '../data/types';
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

function fakeCandidate(
  overrides: Partial<CandidateResult> & Pick<CandidateResult, 'id' | 'votes' | 'position'>,
): CandidateResult {
  return {
    name: `Candidato ${overrides.id}`,
    ballotName: `CANDIDATO ${overrides.id}`,
    number: overrides.id,
    party: 'AAA',
    state: 'BR',
    office: 'presidente',
    finalShare: 0,
    percentage: 0,
    ...overrides,
  };
}

function fakeTseProviderFor(
  office: OfficeKey,
  candidates: CandidateResult[],
  extra: { electorateTotal?: number; electorateAccountedFor?: number; totalValid?: number } = {},
): DataProvider {
  const result: ProviderResult = {
    status: 'ready',
    fetchedAt: Date.now(),
    data: {
      totalApurados: extra.totalValid ?? candidates.reduce((s, c) => s + c.votes, 0),
      totalValid: extra.totalValid ?? candidates.reduce((s, c) => s + c.votes, 0),
      candidates: candidates.map((c) => ({ ...c, office })),
      electorateTotal: extra.electorateTotal,
      electorateAccountedFor: extra.electorateAccountedFor,
    },
  };
  return {
    getElectionData: (): ElectionDataStatus => ({ status: 'ready' }),
    getResults: () => result,
    getCandidates: () => result,
    getLastUpdate: () => Date.now(),
  };
}

describe('AppContext.getOfficeResults — "eleito matematicamente" (applyElectionCertainty) no modo TSE', () => {
  it('marca elected:true para o líder de Presidente no 1º turno quando a margem supera o teto de votos restantes', () => {
    const app = new AppContext();
    // líder 70 de 100 válidos; eleitorado total 110, contabilizado 100 — só
    // 10 votos restantes no pior caso. 70 > 55 (metade de 110) ✓.
    app.tseProvider = fakeTseProviderFor(
      'presidente',
      [fakeCandidate({ id: '1', votes: 70, position: 1 }), fakeCandidate({ id: '2', votes: 30, position: 2 })],
      { electorateTotal: 110, electorateAccountedFor: 100, totalValid: 100 },
    );
    app.state.dataMode = 'tse';

    const results = app.getOfficeResults('presidente', null, 1);
    expect(results.candidates.find((c) => c.id === '1')?.elected).toBe(true);
    expect(results.candidates.find((c) => c.id === '2')?.elected).toBeUndefined();
  });

  it('não marca ninguém quando a margem não é suficiente para garantir a vitória', () => {
    const app = new AppContext();
    // líder 51 de 100, eleitorado total 120 (20 restantes) — 51 não é mais que 60.
    app.tseProvider = fakeTseProviderFor(
      'presidente',
      [fakeCandidate({ id: '1', votes: 51, position: 1 }), fakeCandidate({ id: '2', votes: 49, position: 2 })],
      { electorateTotal: 120, electorateAccountedFor: 100, totalValid: 100 },
    );
    app.state.dataMode = 'tse';

    const results = app.getOfficeResults('presidente', null, 1);
    expect(results.candidates.every((c) => !c.elected)).toBe(true);
  });

  it('Senador: marca os 2 primeiros colocados (2 vagas em disputa) quando a margem é suficiente para ambos', () => {
    const app = new AppContext();
    // 3 candidatos, 2 vagas: 50/30/5, 5 restantes no pior caso — mesmo que
    // os 5 restantes fossem todos do 3º colocado (5+5=10), ele não
    // alcançaria nem o 2º colocado (30).
    app.tseProvider = fakeTseProviderFor(
      'senador',
      [
        fakeCandidate({ id: '1', votes: 50, position: 1 }),
        fakeCandidate({ id: '2', votes: 30, position: 2 }),
        fakeCandidate({ id: '3', votes: 5, position: 3 }),
      ],
      { electorateTotal: 90, electorateAccountedFor: 85, totalValid: 85 },
    );
    app.state.dataMode = 'tse';

    const results = app.getOfficeResults('senador', 'SP', 1);
    expect(results.candidates.find((c) => c.id === '1')?.elected).toBe(true);
    expect(results.candidates.find((c) => c.id === '2')?.elected).toBe(true);
    expect(results.candidates.find((c) => c.id === '3')?.elected).toBeUndefined();
  });

  it('Senador: não marca o 2º colocado quando o 3º ainda pode empatar com ele no pior caso', () => {
    const app = new AppContext();
    // 50/30/20, 10 restantes: no pior caso o 3º chegaria a 30 (empate com o
    // 2º) — a vitória do 2º lugar não está garantida ainda.
    app.tseProvider = fakeTseProviderFor(
      'senador',
      [
        fakeCandidate({ id: '1', votes: 50, position: 1 }),
        fakeCandidate({ id: '2', votes: 30, position: 2 }),
        fakeCandidate({ id: '3', votes: 20, position: 3 }),
      ],
      { electorateTotal: 110, electorateAccountedFor: 100, totalValid: 100 },
    );
    app.state.dataMode = 'tse';

    const results = app.getOfficeResults('senador', 'SP', 1);
    expect(results.candidates.find((c) => c.id === '1')?.elected).toBe(true);
    expect(results.candidates.find((c) => c.id === '2')?.elected).toBeUndefined();
  });

  it('Deputado Federal (proporcional, falta o nº de vagas por UF): nunca marca ninguém, mesmo com margem suficiente', () => {
    const app = new AppContext();
    app.tseProvider = fakeTseProviderFor(
      'deputadoFederal',
      [fakeCandidate({ id: '1', votes: 90, position: 1 }), fakeCandidate({ id: '2', votes: 10, position: 2 })],
      { electorateTotal: 100, electorateAccountedFor: 100, totalValid: 100 },
    );
    app.state.dataMode = 'tse';

    const results = app.getOfficeResults('deputadoFederal', 'SP', 1);
    expect(results.candidates.every((c) => !c.elected)).toBe(true);
  });

  it('não marca ninguém quando o acompanhamento ainda não trouxe eleitorado (electorateTotal/electorateAccountedFor ausentes)', () => {
    const app = new AppContext();
    app.tseProvider = fakeTseProviderFor('presidente', [
      fakeCandidate({ id: '1', votes: 90, position: 1 }),
      fakeCandidate({ id: '2', votes: 10, position: 2 }),
    ]);
    app.state.dataMode = 'tse';

    const results = app.getOfficeResults('presidente', null, 1);
    expect(results.candidates.every((c) => !c.elected)).toBe(true);
  });

  it('usa a regra de maioria simples (não absoluta) no 2º turno', () => {
    const app = new AppContext();
    // 2º turno: líder 50, segundo 30, 15 restantes — margem (20) > restantes
    // (15), decidido mesmo sem ultrapassar 50% do total final possível.
    app.tseProvider = fakeTseProviderFor(
      'governador',
      [fakeCandidate({ id: '1', votes: 50, position: 1 }), fakeCandidate({ id: '2', votes: 30, position: 2 })],
      { electorateTotal: 95, electorateAccountedFor: 80, totalValid: 80 },
    );
    app.state.dataMode = 'tse';

    const results = app.getOfficeResults('governador', 'SP', 2);
    expect(results.candidates.find((c) => c.id === '1')?.elected).toBe(true);
  });
});

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
