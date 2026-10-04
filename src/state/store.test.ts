import { describe, expect, it } from 'vitest';
import { createInitialState, officeUfForCurrent } from './store';

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
