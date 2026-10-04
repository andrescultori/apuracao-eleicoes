import { describe, expect, it } from 'vitest';
import { computeResults, generateCandidateList, getScopeElectorate } from './mockDataProvider';

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

  describe('viés regional de um cargo nacional (Presidente) filtrado por UF — ver mapa do Brasil', () => {
    it('sem UF (uso padrão fora do mapa), o eleitorado é o do Brasil inteiro, como antes', () => {
      expect(getScopeElectorate('presidente', null)).toBeGreaterThan(getScopeElectorate('presidente', 'SP'));
    });

    it('com uma UF específica, o eleitorado passa a ser só o daquela UF', () => {
      expect(getScopeElectorate('presidente', 'SP')).toBeGreaterThan(getScopeElectorate('presidente', 'RR'));
    });

    it('a mesma lista de candidatos (identidade) aparece em qualquer UF — são os mesmos candidatos nacionais', () => {
      const sp = generateCandidateList('presidente', 'SP', 1);
      const rr = generateCandidateList('presidente', 'RR', 1);
      expect(sp.map((c) => c.id)).toEqual(rr.map((c) => c.id));
    });

    it('resultados variam de UF para UF, mesmo com a apuração 100% concluída (t=1)', () => {
      const sp = computeResults('presidente', 'SP', 1, 10, 1);
      const rr = computeResults('presidente', 'RR', 1, 10, 1);
      // Mesmos candidatos, mas pelo menos um percentual difere de verdade entre os dois estados —
      // sem isso, o mapa de demonstração mostraria o Brasil inteiro com a mesma cor ao final.
      const spPct = Object.fromEntries(sp.candidates.map((c) => [c.id, c.percentage]));
      const differs = rr.candidates.some((c) => Math.abs(c.percentage - spPct[c.id]!) > 0.5);
      expect(differs).toBe(true);
    });

    it('é determinístico: a mesma UF sempre dá o mesmo resultado', () => {
      const a = computeResults('presidente', 'SP', 1, 10, 1);
      const b = computeResults('presidente', 'SP', 1, 10, 1);
      expect(a.candidates.map((c) => c.percentage)).toEqual(b.candidates.map((c) => c.percentage));
    });

    it('sem UF, o comportamento nacional de sempre continua igual (sem viés regional)', () => {
      const a = computeResults('presidente', null, 1, 10, 1);
      const b = computeResults('presidente', null, 1, 10, 1);
      expect(a.candidates.map((c) => c.percentage)).toEqual(b.candidates.map((c) => c.percentage));
    });
  });
});
