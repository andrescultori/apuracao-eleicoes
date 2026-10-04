import { describe, expect, it } from 'vitest';
import type { CandidateResult, ElectionResults } from '../data/types';
import { AppContext } from '../state/appContext';
import { CandidateTable } from './candidateTable';

function fakeCandidates(count: number): CandidateResult[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i),
    name: `Candidato Completo ${i}`,
    ballotName: `Candidato ${i}`,
    number: String(1000 + i),
    party: 'XYZ',
    state: 'SP',
    office: 'deputadoFederal',
    finalShare: 0,
    votes: count - i,
    percentage: 1,
    position: i + 1,
  }));
}

function fakeResults(count: number): ElectionResults {
  return { candidates: fakeCandidates(count), totalValid: count, totalApurados: count };
}

describe('CandidateTable — paginação', () => {
  it('sem paginação quando há 30 candidatos ou menos', () => {
    const app = new AppContext();
    const html = CandidateTable(app, 'deputadoFederal', 1, 'SP', fakeResults(30), {});
    expect(html).not.toContain('class="pagination"');
    // todos os 30 aparecem na mesma página
    expect((html.match(/class="cand-name"/g) ?? []).length).toBe(30);
  });

  it('pagina de 30 em 30 quando há mais candidatos que isso', () => {
    const app = new AppContext();
    app.state.candidatePage = 1;
    const html = CandidateTable(app, 'deputadoFederal', 1, 'SP', fakeResults(65), {});
    expect(html).toContain('class="pagination"');
    expect(html).toContain('Página 1 de 3');
    expect(html).toContain('65 candidatos');
    expect((html.match(/class="cand-name"/g) ?? []).length).toBe(30);
    // botão "Anterior" desabilitado na 1ª página
    expect(html).toMatch(/data-value="0"[^>]*disabled/);
  });

  it('última página mostra só o resto (65 candidatos → 5 na 3ª página) e desabilita "Próxima"', () => {
    const app = new AppContext();
    app.state.candidatePage = 3;
    const html = CandidateTable(app, 'deputadoFederal', 1, 'SP', fakeResults(65), {});
    expect(html).toContain('Página 3 de 3');
    expect((html.match(/class="cand-name"/g) ?? []).length).toBe(5);
    expect(html).toMatch(/data-value="4"[^>]*disabled/);
  });

  it('candidatePage fora do intervalo é sujeito a clamp (nunca quebra, nunca mostra página vazia)', () => {
    const app = new AppContext();
    app.state.candidatePage = 999;
    const html = CandidateTable(app, 'deputadoFederal', 1, 'SP', fakeResults(65), {});
    expect(html).toContain('Página 3 de 3');
  });

  it('mostra o nome de urna (ballotName) no texto visível; o nome completo fica só no title (tooltip)', () => {
    const app = new AppContext();
    const html = CandidateTable(app, 'deputadoFederal', 1, 'SP', fakeResults(1), {});
    expect(html).toContain('title="Candidato Completo 0">Candidato 0<');
  });
});
