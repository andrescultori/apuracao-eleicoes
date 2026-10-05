import { describe, expect, it } from 'vitest';
import type { CandidateResult, ElectionResults } from '../data/types';
import { AppContext } from '../state/appContext';
import { ElectedSection } from './electedSection';

function fakeCandidate(id: string, elected: boolean | undefined): CandidateResult {
  return {
    id,
    name: `Candidato Completo ${id}`,
    ballotName: `Candidato ${id}`,
    number: id,
    party: 'XYZ',
    state: 'SP',
    office: 'senador',
    finalShare: 0,
    percentage: 50,
    votes: 100,
    position: 1,
    elected,
  };
}

function fakeResults(elected: (boolean | undefined)[]): ElectionResults {
  return {
    candidates: elected.map((e, i) => fakeCandidate(String(i), e)),
    totalValid: 200,
    totalApurados: 200,
  };
}

describe('ElectedSection', () => {
  it('só renderiza para Senador — nunca para outros cargos, mesmo com candidatos elected:true', () => {
    const app = new AppContext();
    const results = fakeResults([true, true]);
    expect(ElectedSection(app, 'presidente', 1, null, results)).toBe('');
    expect(ElectedSection(app, 'governador', 1, 'SP', results)).toBe('');
    expect(ElectedSection(app, 'deputadoFederal', 1, 'SP', results)).toBe('');
  });

  it('não renderiza nada quando nenhum candidato está marcado elected:true', () => {
    const app = new AppContext();
    const results = fakeResults([false, undefined]);
    expect(ElectedSection(app, 'senador', 1, 'SP', results)).toBe('');
  });

  it('lista só os candidatos eleitos, com nome de urna e não o nome completo', () => {
    const app = new AppContext();
    const results = fakeResults([true, true, false]);
    const html = ElectedSection(app, 'senador', 1, 'SP', results);
    expect((html.match(/class="elected-card"/g) ?? []).length).toBe(2);
    expect(html).toContain('title="Candidato Completo 0">Candidato 0<');
    expect(html).not.toContain('Candidato 2'); // não eleito, fora da seção
  });

  it('mostra quantos de quantas vagas (2, pro Senado neste ciclo) já foram decididas', () => {
    const app = new AppContext();
    const results = fakeResults([true]);
    const html = ElectedSection(app, 'senador', 1, 'SP', results);
    expect(html).toContain('1 de 2 vagas');
  });
});
