import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialState, loadResultsHistory, officeUfForCurrent, persistResultsHistory } from './store';

beforeEach(() => {
  localStorage.clear();
});

describe('officeUfForCurrent', () => {
  it('cargo de abrangência estadual (Governador) usa sempre state.uf, nunca o filtro do mapa nacional', () => {
    const state = createInitialState();
    state.uf = 'SP';
    state.nationalUfFilter = 'RR';
    expect(officeUfForCurrent(state, 'governador')).toBe('SP');
  });

  it('cargo nacional (Presidente) sem filtro do mapa devolve null (Brasil inteiro)', () => {
    const state = createInitialState();
    expect(state.nationalUfFilter).toBeNull();
    expect(officeUfForCurrent(state, 'presidente')).toBeNull();
  });

  it('cargo nacional (Presidente) com uma UF clicada no mapa devolve essa UF, ignorando state.uf', () => {
    const state = createInitialState();
    state.uf = 'SP';
    state.nationalUfFilter = 'RR';
    expect(officeUfForCurrent(state, 'presidente')).toBe('RR');
  });
});

describe('loadResultsHistory / persistResultsHistory — versionamento', () => {
  it('lê de volta um histórico que acabou de salvar', () => {
    const history = {
      'presidente|BR|1': [{ fetchedAt: 1000, candidates: [{ id: 'a', ballotName: 'A', percentage: 50 }] }],
    };
    persistResultsHistory(history);
    expect(loadResultsHistory()).toEqual(history);
  });

  it('descarta um histórico salvo num formato antigo (sem o envelope de versão) — bug real: pontos gravados por versões antigas da conta do percentual ficavam salvos pra sempre, misturando dados errados com os corrigidos', () => {
    // Formato usado antes do envelope `{v, data}` — um Record puro.
    localStorage.setItem(
      'apuracao2026_history',
      JSON.stringify({ 'presidente|BR|1': [{ fetchedAt: 1000, candidates: [] }] }),
    );
    expect(loadResultsHistory()).toEqual({});
  });

  it('descarta um histórico salvo com uma versão antiga do envelope', () => {
    localStorage.setItem(
      'apuracao2026_history',
      JSON.stringify({ v: 1, data: { 'presidente|BR|1': [{ fetchedAt: 1000, candidates: [] }] } }),
    );
    expect(loadResultsHistory()).toEqual({});
  });
});
