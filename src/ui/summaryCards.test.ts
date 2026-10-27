import { describe, expect, it } from 'vitest';
import type { CandidateResult, ElectionResults } from '../data/types';
import { SummaryCards } from './summaryCards';

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

function fakeResults(candidates: CandidateResult[], overrides: Partial<ElectionResults> = {}): ElectionResults {
  return { candidates, totalValid: 200, totalApurados: 220, ...overrides };
}

describe('SummaryCards', () => {
  it('renderiza um card só (não mais 3 separados)', () => {
    const html = SummaryCards(fakeResults([]), 50);
    expect((html.match(/class="apuracao-card"/g) ?? []).length).toBe(1);
  });

  it('mostra "X de Y votos apurados" juntando votos válidos e apurados, em vez de 2 cards soltos', () => {
    const results = fakeResults([], { totalValid: 180, totalApurados: 200 });
    const html = SummaryCards(results, 50);
    expect(html).toContain('180 de 200 votos apurados');
  });

  it('mostra a contagem bruta de seções (X de Y seções) quando disponível', () => {
    const results = fakeResults([], { sectionsTotal: 1000, sectionsCounted: 870 });
    const html = SummaryCards(results, 87);
    expect(html).toContain('870 de 1.000 seções');
  });

  it('omite a contagem de seções quando ainda não disponível (sectionsTotal/sectionsCounted undefined)', () => {
    const html = SummaryCards(fakeResults([]), null);
    expect(html).not.toContain('seções');
  });

  it('percentual "—" quando sectionsPercent é null, percentual formatado quando não é', () => {
    expect(SummaryCards(fakeResults([]), null)).toContain('>—<');
    expect(SummaryCards(fakeResults([]), 42.5)).toContain('42,50');
  });

  it('barra de distribuição por candidato: um segmento colorido por candidato, largura = percentual', () => {
    const results = fakeResults([
      fakeCandidate({ id: 'a', party: 'PT', percentage: 60 }),
      fakeCandidate({ id: 'b', party: 'PL', percentage: 40 }),
    ]);
    const html = SummaryCards(results, 50);
    const segs = html.match(/class="vote-share-seg"[^>]*/g) ?? [];
    expect(segs.length).toBe(2);
    expect(html).toContain('width:60.00%');
    expect(html).toContain('width:40.00%');
  });

  it('barra de distribuição limitada aos 8 mais votados', () => {
    const candidates = Array.from({ length: 12 }, (_, i) =>
      fakeCandidate({ id: String(i), votes: 100 - i, percentage: 100 - i }),
    );
    const html = SummaryCards(fakeResults(candidates), 50);
    const segs = html.match(/class="vote-share-seg"/g) ?? [];
    expect(segs.length).toBe(8);
  });

  it('sem candidatos, não renderiza a barra de distribuição', () => {
    const html = SummaryCards(fakeResults([]), 50);
    expect(html).not.toContain('vote-share-bar');
  });
});
