import { describe, expect, it } from 'vitest';
import { computeResults, generateCandidateList } from './mockDataProvider';

describe('mockDataProvider (modo demonstração)', () => {
  it('gera a mesma lista de candidatos para os mesmos parâmetros (determinístico)', () => {
    const a = generateCandidateList('deputadoFederal', 'SP', 1);
    const b = generateCandidateList('deputadoFederal', 'SP', 1);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('não gera segundo turno para cargos sem runoff', () => {
    expect(generateCandidateList('senador', 'SP', 2)).toEqual([]);
  });

  it('computeResults distribui 100% dos votos válidos entre os candidatos', () => {
    const results = computeResults('presidente', null, 1, 3, 0.5);
    const totalVotes = results.candidates.reduce((sum, c) => sum + c.votes, 0);
    expect(totalVotes).toBeGreaterThan(0);
    expect(Math.abs(totalVotes - results.totalValid)).toBeLessThan(results.totalValid * 0.01);
  });

  it('atribui posições em ordem decrescente de votos', () => {
    const results = computeResults('governador', 'PR', 1, 2, 0.6);
    for (let i = 1; i < results.candidates.length; i++) {
      expect(results.candidates[i - 1]!.votes).toBeGreaterThanOrEqual(results.candidates[i]!.votes);
      expect(results.candidates[i]!.position).toBe(i + 1);
    }
  });
});
