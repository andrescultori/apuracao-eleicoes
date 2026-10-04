import { describe, expect, it } from 'vitest';
import { createInitialState } from './store';
import { applyRoute, currentRoute, parsePath, pathForRoute, routeForState, toHref } from './router';
import type { ParsedRoute } from './router';

describe('pathForRoute / parsePath — ida e volta', () => {
  it('Visão geral → "/"', () => {
    expect(pathForRoute({ page: 'overview', uf: null })).toBe('/');
  });

  it('Favoritos → "/favoritos"', () => {
    expect(pathForRoute({ page: 'favorites', uf: null })).toBe('/favoritos');
    expect(parsePath('/favoritos')).toEqual({ page: 'favorites', uf: null });
  });

  it('Sobre → "/sobre"', () => {
    expect(pathForRoute({ page: 'about', uf: null })).toBe('/sobre');
    expect(parsePath('/sobre')).toEqual({ page: 'about', uf: null });
  });

  it('cargo nacional sem UF (Presidente, Brasil) → "/presidente"', () => {
    expect(pathForRoute({ page: 'presidente', uf: null })).toBe('/presidente');
    expect(parsePath('/presidente')).toEqual({ page: 'presidente', uf: null });
  });

  it('cargo nacional com UF (Presidente filtrado por estado) → "/presidente/pr"', () => {
    expect(pathForRoute({ page: 'presidente', uf: 'PR' })).toBe('/presidente/pr');
    expect(parsePath('/presidente/pr')).toEqual({ page: 'presidente', uf: 'PR' });
  });

  it('cargo estadual (Governador/SP) → "/governador/sp", maiúsculo/minúsculo não importa na leitura', () => {
    expect(pathForRoute({ page: 'governador', uf: 'SP' })).toBe('/governador/sp');
    expect(parsePath('/governador/sp')).toEqual({ page: 'governador', uf: 'SP' });
    expect(parsePath('/governador/SP')).toEqual({ page: 'governador', uf: 'SP' });
  });

  it('cargo com slug composto (Deputado Federal/Estadual)', () => {
    expect(pathForRoute({ page: 'deputadoFederal', uf: 'RJ' })).toBe('/deputado-federal/rj');
    expect(parsePath('/deputado-federal/rj')).toEqual({ page: 'deputadoFederal', uf: 'RJ' });
    expect(pathForRoute({ page: 'deputadoEstadual', uf: 'RJ' })).toBe('/deputado-estadual/rj');
    expect(parsePath('/deputado-estadual/rj')).toEqual({ page: 'deputadoEstadual', uf: 'RJ' });
  });
});

describe('parsePath — rotas inválidas devolvem null (nunca inventa um estado)', () => {
  it('raiz pura não é uma rota explícita — devolve null, não "overview"', () => {
    expect(parsePath('/')).toBeNull();
  });

  it('slug de cargo desconhecido', () => {
    expect(parsePath('/prefeito')).toBeNull();
  });

  it('UF desconhecida', () => {
    expect(parsePath('/governador/xx')).toBeNull();
  });

  it('segmentos demais', () => {
    expect(parsePath('/governador/sp/extra')).toBeNull();
  });
});

describe('routeForState', () => {
  it('Presidente sem filtro de UF no mapa → uf null', () => {
    const state = createInitialState();
    state.page = 'presidente';
    state.nationalUfFilter = null;
    expect(routeForState(state)).toEqual({ page: 'presidente', uf: null });
  });

  it('Presidente com UF filtrada no mapa → usa nationalUfFilter, não state.uf', () => {
    const state = createInitialState();
    state.page = 'presidente';
    state.uf = 'PR'; // seletor "normal", irrelevante pra Presidente
    state.nationalUfFilter = 'RR';
    expect(routeForState(state)).toEqual({ page: 'presidente', uf: 'RR' });
  });

  it('Governador sempre usa state.uf (sempre tem alguma UF)', () => {
    const state = createInitialState();
    state.page = 'governador';
    state.uf = 'SP';
    expect(routeForState(state)).toEqual({ page: 'governador', uf: 'SP' });
  });
});

describe('toHref / currentRoute (base do deploy "/", como no ambiente de teste)', () => {
  it('toHref não muda o caminho quando a base é "/"', () => {
    expect(toHref('/governador/sp')).toBe('/governador/sp');
  });

  it('currentRoute lê window.location (via history.pushState) e devolve a rota', () => {
    history.pushState(null, '', '/governador/sp');
    expect(currentRoute()).toEqual({ page: 'governador', uf: 'SP' });
  });

  it('currentRoute devolve null na raiz pura — nunca força "overview"', () => {
    history.pushState(null, '', '/');
    expect(currentRoute()).toBeNull();
  });
});

describe('applyRoute', () => {
  it('Presidente com UF na rota seta nationalUfFilter, não state.uf', () => {
    const state = createInitialState();
    const route: ParsedRoute = { page: 'presidente', uf: 'RR' };
    applyRoute(state, route);
    expect(state.page).toBe('presidente');
    expect(state.nationalUfFilter).toBe('RR');
  });

  it('Governador com UF na rota seta state.uf', () => {
    const state = createInitialState();
    const route: ParsedRoute = { page: 'governador', uf: 'SP' };
    applyRoute(state, route);
    expect(state.page).toBe('governador');
    expect(state.uf).toBe('SP');
  });

  it('Governador sem UF na rota (não deveria acontecer, mas é seguro) mantém a UF que já estava', () => {
    const state = createInitialState();
    state.uf = 'PR';
    applyRoute(state, { page: 'governador', uf: null });
    expect(state.uf).toBe('PR');
  });

  it('página sem cargo (Favoritos/Sobre/Visão geral) não mexe em uf/nationalUfFilter', () => {
    const state = createInitialState();
    state.uf = 'PR';
    state.nationalUfFilter = 'RR';
    applyRoute(state, { page: 'favorites', uf: null });
    expect(state.page).toBe('favorites');
    expect(state.uf).toBe('PR');
    expect(state.nationalUfFilter).toBe('RR');
  });
});
