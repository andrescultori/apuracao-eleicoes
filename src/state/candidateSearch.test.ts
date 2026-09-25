import { describe, expect, it } from 'vitest';
import { generateCandidateList } from '../data/mockDataProvider';
import { AppContext } from './appContext';
import { searchAllCandidates } from './candidateSearch';

describe('searchAllCandidates', () => {
  it('devolve lista vazia para busca em branco', () => {
    const app = new AppContext();
    expect(searchAllCandidates(app, '   ')).toEqual([]);
  });

  it('encontra um candidato nacional (Presidente) pelo nome', () => {
    const app = new AppContext();
    const known = generateCandidateList('presidente', null, 1)[0]!;
    const hits = searchAllCandidates(app, known.name);
    expect(hits.some((h) => h.office === 'presidente' && h.candidate.id === known.id)).toBe(true);
  });

  it('encontra um candidato estadual pelo número, em qualquer UF', () => {
    const app = new AppContext();
    app.state.uf = 'PR'; // filtro atual não deveria limitar a busca
    const known = generateCandidateList('governador', 'SP', 1)[0]!;
    const hits = searchAllCandidates(app, known.number);
    const hit = hits.find((h) => h.office === 'governador' && h.uf === 'SP');
    expect(hit).toBeDefined();
    expect(hit?.candidate.id).toBe(known.id);
  });

  it('não retorna cargos sem segundo turno quando o turno selecionado é 2', () => {
    const app = new AppContext();
    app.state.turn = 2;
    const senadorT1 = generateCandidateList('senador', 'SP', 1)[0]!;
    const hits = searchAllCandidates(app, senadorT1.name);
    expect(hits.some((h) => h.office === 'senador')).toBe(false);
  });

  it('devolve lista vazia quando nada corresponde à busca', () => {
    const app = new AppContext();
    expect(searchAllCandidates(app, 'zzzzzzzzzz-inexistente')).toEqual([]);
  });
});
