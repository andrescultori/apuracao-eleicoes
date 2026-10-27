import { describe, expect, it } from 'vitest';
import type { CandidateResult, ElectionResults } from '../data/types';
import { HeadToHeadBar } from './headToHead';

function fakeCandidate(overrides: Partial<CandidateResult> & Pick<CandidateResult, 'id'>): CandidateResult {
  return {
    name: `Candidato Completo ${overrides.id}`,
    ballotName: `Candidato ${overrides.id}`,
    number: overrides.id,
    party: 'XYZ',
    state: 'BR',
    office: 'presidente',
    finalShare: 0,
    percentage: 50,
    votes: 100,
    position: 1,
    ...overrides,
  };
}

function fakeResults(candidates: CandidateResult[]): ElectionResults {
  return { candidates, totalValid: 200, totalApurados: 200 };
}

describe('HeadToHeadBar', () => {
  it('não renderiza nada quando a corrida não tem exatamente 2 candidatos', () => {
    expect(HeadToHeadBar(fakeResults([]))).toBe('');
    expect(HeadToHeadBar(fakeResults([fakeCandidate({ id: 'a' })]))).toBe('');
    expect(
      HeadToHeadBar(fakeResults([fakeCandidate({ id: 'a' }), fakeCandidate({ id: 'b' }), fakeCandidate({ id: 'c' })])),
    ).toBe('');
  });

  it('nunca declara vencedor — não menciona "eleito" em nenhuma forma', () => {
    const results = fakeResults([
      fakeCandidate({ id: 'a', ballotName: 'Lula', party: 'PT', votes: 64256232, percentage: 51.79 }),
      fakeCandidate({ id: 'b', ballotName: 'Flávio', party: 'PL', votes: 59826041, percentage: 48.21 }),
    ]);
    const html = HeadToHeadBar(results);
    expect(html.toLowerCase()).not.toContain('eleit');
  });

  it('mostra nome de urna, partido, número, percentual e votos dos dois candidatos, maior votado à esquerda', () => {
    const results = fakeResults([
      fakeCandidate({ id: 'a', ballotName: 'Candidato Menor', party: 'PT', number: '13', votes: 100, percentage: 40 }),
      fakeCandidate({ id: 'b', ballotName: 'Candidato Maior', party: 'PL', number: '22', votes: 150, percentage: 60 }),
    ]);
    const html = HeadToHeadBar(results);
    const leftIdx = html.indexOf('h2h-left');
    const rightIdx = html.indexOf('h2h-right');
    expect(leftIdx).toBeGreaterThan(-1);
    expect(rightIdx).toBeGreaterThan(leftIdx);
    expect(html).toContain('Candidato Maior');
    expect(html).toContain('Candidato Menor');
    // o mais votado (Maior, 150 votos) vem primeiro, à esquerda
    expect(html.indexOf('Candidato Maior')).toBeLessThan(html.indexOf('Candidato Menor'));
    expect(html).toContain('>PT<');
    expect(html).toContain('>PL<');
    expect(html).toContain('13');
    expect(html).toContain('22');
    expect(html).toContain('150 votos');
    expect(html).toContain('100 votos');
  });

  it('calcula a diferença de votos e de pontos percentuais corretamente', () => {
    const results = fakeResults([
      fakeCandidate({ id: 'a', votes: 64256232, percentage: 51.79 }),
      fakeCandidate({ id: 'b', votes: 59826041, percentage: 48.21 }),
    ]);
    const html = HeadToHeadBar(results);
    expect(html).toContain('4.430.191 votos');
    expect(html).toContain('3,58');
  });

  it('renormaliza a largura da barra só entre os 2 candidatos (sempre soma 100%)', () => {
    const results = fakeResults([
      fakeCandidate({ id: 'a', votes: 60, percentage: 30 }),
      fakeCandidate({ id: 'b', votes: 40, percentage: 20 }),
    ]);
    const html = HeadToHeadBar(results);
    // 30/(30+20) = 60%, 20/(30+20) = 40%
    expect(html).toContain('width:60.00%');
    expect(html).toContain('width:40.00%');
  });

  it('usa 50/50 na barra quando a soma dos percentuais é zero (evita divisão por zero)', () => {
    const results = fakeResults([
      fakeCandidate({ id: 'a', votes: 0, percentage: 0 }),
      fakeCandidate({ id: 'b', votes: 0, percentage: 0 }),
    ]);
    const html = HeadToHeadBar(results);
    expect(html).toContain('width:50.00%');
  });
});
