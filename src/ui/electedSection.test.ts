import { describe, expect, it } from 'vitest';
import type { CandidateResult, ElectionResults, OfficeKey } from '../data/types';
import { AppContext } from '../state/appContext';
import { ElectedSection, RunoffSection } from './electedSection';

function fakeCandidate(
  id: string,
  office: OfficeKey,
  overrides: Partial<Pick<CandidateResult, 'elected' | 'confirmedRunoff'>> = {},
): CandidateResult {
  return {
    id,
    name: `Candidato Completo ${id}`,
    ballotName: `Candidato ${id}`,
    number: id,
    party: 'XYZ',
    state: 'SP',
    office,
    finalShare: 0,
    percentage: 50,
    votes: 100,
    position: 1,
    ...overrides,
  };
}

function fakeResults(
  office: OfficeKey,
  overrides: Partial<Pick<CandidateResult, 'elected' | 'confirmedRunoff'>>[],
): ElectionResults {
  return {
    candidates: overrides.map((o, i) => fakeCandidate(String(i), office, o)),
    totalValid: 200,
    totalApurados: 200,
  };
}

describe('ElectedSection', () => {
  it('renderiza para Presidente, Governador e Senador — nunca para Deputado Federal/Estadual, mesmo com candidatos elected:true', () => {
    const app = new AppContext();
    const senadoResults = fakeResults('senador', [{ elected: true }, { elected: true }]);
    const presResults = fakeResults('presidente', [{ elected: true }]);
    const govResults = fakeResults('governador', [{ elected: true }]);
    const depResults = fakeResults('deputadoFederal', [{ elected: true }]);
    const depEstResults = fakeResults('deputadoEstadual', [{ elected: true }]);

    expect(ElectedSection(app, 'senador', 1, 'SP', senadoResults)).not.toBe('');
    expect(ElectedSection(app, 'presidente', 1, null, presResults)).not.toBe('');
    expect(ElectedSection(app, 'governador', 1, 'SP', govResults)).not.toBe('');
    expect(ElectedSection(app, 'deputadoFederal', 1, 'SP', depResults)).toBe('');
    expect(ElectedSection(app, 'deputadoEstadual', 1, 'SP', depEstResults)).toBe('');
  });

  it('não renderiza nada quando nenhum candidato está marcado elected:true', () => {
    const app = new AppContext();
    const results = fakeResults('senador', [{ elected: false }, {}]);
    expect(ElectedSection(app, 'senador', 1, 'SP', results)).toBe('');
  });

  it('lista só os candidatos eleitos, com nome de urna e não o nome completo', () => {
    const app = new AppContext();
    const results = fakeResults('senador', [{ elected: true }, { elected: true }, { elected: false }]);
    const html = ElectedSection(app, 'senador', 1, 'SP', results);
    expect((html.match(/class="elected-card"/g) ?? []).length).toBe(2);
    expect(html).toContain('title="Candidato Completo 0">Candidato 0<');
    expect(html).not.toContain('Candidato 2'); // não eleito, fora da seção
  });

  it('Senado: mostra quantos de quantas vagas (2 neste ciclo) já foram decididas', () => {
    const app = new AppContext();
    const results = fakeResults('senador', [{ elected: true }]);
    const html = ElectedSection(app, 'senador', 1, 'SP', results);
    expect(html).toContain('1 de 2 vagas');
  });

  it('Presidente/Governador (1 vaga só): não usa a moldura "N de M vagas", mostra só "Resultado decidido"', () => {
    const app = new AppContext();
    const results = fakeResults('presidente', [{ elected: true }]);
    const html = ElectedSection(app, 'presidente', 1, null, results);
    expect(html).toContain('Resultado decidido matematicamente');
    expect(html).not.toContain('de 1 vaga');
  });
});

describe('RunoffSection', () => {
  it('só renderiza no 1º turno de Presidente/Governador — nunca no 2º turno, nem para Senador/Deputado', () => {
    const app = new AppContext();
    const presResults = fakeResults('presidente', [{ confirmedRunoff: true }]);
    expect(RunoffSection(app, 'presidente', 1, null, presResults)).not.toBe('');
    expect(RunoffSection(app, 'presidente', 2, null, presResults)).toBe('');
    expect(RunoffSection(app, 'governador', 2, 'SP', fakeResults('governador', [{ confirmedRunoff: true }]))).toBe('');
    expect(RunoffSection(app, 'senador', 1, 'SP', fakeResults('senador', [{ confirmedRunoff: true }]))).toBe('');
  });

  it('não renderiza nada quando ninguém está confirmado para o 2º turno', () => {
    const app = new AppContext();
    const results = fakeResults('presidente', [{}, {}]);
    expect(RunoffSection(app, 'presidente', 1, null, results)).toBe('');
  });

  it('lista os candidatos confirmados, com o visual "runoff" (azul) em vez do de "Eleitos" (verde)', () => {
    const app = new AppContext();
    const results = fakeResults('presidente', [{ confirmedRunoff: true }, { confirmedRunoff: true }, {}]);
    const html = RunoffSection(app, 'presidente', 1, null, results);
    expect(html).toContain('class="elected-section runoff"');
    expect((html.match(/class="elected-card"/g) ?? []).length).toBe(2);
    expect(html).toContain('2 de 2 vagas garantidas');
  });
});
