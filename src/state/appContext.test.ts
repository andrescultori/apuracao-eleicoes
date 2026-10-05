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
          // Deliberadamente diferente de votes/totalValid*100 (50%) — ver
          // nota em `applyVoteBasis`: na base "válidos" (a padrão), o
          // percentual que o provedor manda (aqui simulando o `pvapn` real
          // do TSE) é usado como veio, nunca recalculado.
          percentage: 51.5,
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

describe('AppContext.getOfficeResults — "eleito matematicamente"/"confirmado pro 2º turno" DESLIGADOS (applyElectionCertainty)', () => {
  // Caso real (05/10/2026) que forçou o desligamento: Governador/RJ, o app
  // marcava "Eleito matematicamente" com 50,88% — o resultado OFICIAL final
  // ficou em 49,27%, foi pra 2º turno. O teto de votos restantes
  // (electorateTotal/electorateAccountedFor, do EA14) não é confiável contra
  // o ambiente oficial (ver nota em `applyElectionCertainty`). Estes testes
  // reusam cenários que ANTES marcavam elected/confirmedRunoff — servem de
  // proteção contra religar isso sem querer num refactor futuro.
  it('nunca marca elected, mesmo num cenário que folgadamente "venceria" pela conta antiga (70 de 100, só 10 restantes)', () => {
    const app = new AppContext();
    app.tseProvider = fakeTseProviderFor(
      'presidente',
      [fakeCandidate({ id: '1', votes: 70, position: 1 }), fakeCandidate({ id: '2', votes: 30, position: 2 })],
      { electorateTotal: 110, electorateAccountedFor: 100, totalValid: 100 },
    );
    app.state.dataMode = 'tse';

    const results = app.getOfficeResults('presidente', null, 1);
    expect(results.candidates.every((c) => !c.elected)).toBe(true);
  });

  it('Senador: nunca marca elected, mesmo num cenário que folgadamente garantiria os 2 primeiros pela conta antiga', () => {
    const app = new AppContext();
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
    expect(results.candidates.every((c) => !c.elected)).toBe(true);
  });

  it('2º turno: nunca marca elected, mesmo num cenário que folgadamente decidiria pela conta antiga (maioria simples)', () => {
    const app = new AppContext();
    app.tseProvider = fakeTseProviderFor(
      'governador',
      [fakeCandidate({ id: '1', votes: 50, position: 1 }), fakeCandidate({ id: '2', votes: 30, position: 2 })],
      { electorateTotal: 95, electorateAccountedFor: 80, totalValid: 80 },
    );
    app.state.dataMode = 'tse';

    const results = app.getOfficeResults('governador', 'SP', 2);
    expect(results.candidates.every((c) => !c.elected)).toBe(true);
  });

  it('Deputado Federal: nunca marca elected (já era assim, segue assim)', () => {
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

  it('Presidente 1º turno: nunca marca confirmedRunoff, mesmo num cenário que folgadamente garantiria a vaga pela conta antiga', () => {
    const app = new AppContext();
    app.tseProvider = fakeTseProviderFor(
      'presidente',
      [
        fakeCandidate({ id: '1', votes: 40, position: 1 }),
        fakeCandidate({ id: '2', votes: 35, position: 2 }),
        fakeCandidate({ id: '3', votes: 10, position: 3 }),
      ],
      { electorateTotal: 100, electorateAccountedFor: 85, totalValid: 85 },
    );
    app.state.dataMode = 'tse';

    const results = app.getOfficeResults('presidente', null, 1);
    expect(results.candidates.every((c) => !c.elected && !c.confirmedRunoff)).toBe(true);
  });
});

describe('AppContext.getOfficeResults — base do percentual (voteBasis) no modo TSE', () => {
  it('na base "válidos" (padrão), usa o percentual que já veio do provedor — nunca recalcula de votes/totalValid', () => {
    // Caso real (05/10/2026): Governador/RJ, o percentual recalculado
    // (votes/totalValid) divergia do oficial do TSE por um fator idêntico
    // pros 2 primeiros colocados — sinal de que `totalValid` não batia com
    // o denominador que o TSE usa de verdade pro `pvapn`. Ver nota em
    // `applyVoteBasis`.
    const app = new AppContext();
    app.tseProvider = fakeReadyProvider();
    app.state.dataMode = 'tse';
    app.state.voteBasis = 'valid';

    const results = app.getOfficeResults('presidente', null, 1);
    // 51,5% como veio do provedor — não os 50% que 400/800 daria.
    expect(results.candidates[0]?.percentage).toBeCloseTo(51.5, 6);
  });

  it('recalcula sobre votos totais quando voteBasis é "total" (não existe um percentual oficial nessa base)', () => {
    const app = new AppContext();
    app.tseProvider = fakeReadyProvider();
    app.state.dataMode = 'tse';
    app.state.voteBasis = 'total';

    const results = app.getOfficeResults('presidente', null, 1);
    // 400 votos / 1000 apurados = 40%.
    expect(results.candidates[0]?.percentage).toBeCloseTo(40, 6);
  });
});
