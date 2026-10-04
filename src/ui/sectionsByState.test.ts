import { describe, expect, it } from 'vitest';
import type { DataProvider, ElectionDataStatus, ProviderResult } from '../data/types';
import { AppContext } from '../state/appContext';
import { SectionsByStateCard } from './sectionsByState';

/** Provedor fake cujo `sectionsPercent` por UF vem de uma tabela — UFs fora da tabela ficam sem dado. */
function fakeSectionsProvider(percentByUf: Record<string, number>): DataProvider {
  return {
    getElectionData: (): ElectionDataStatus => ({ status: 'ready' }),
    getResults: (_office, uf, _turn): ProviderResult => {
      const percent = uf ? percentByUf[uf] : undefined;
      if (percent === undefined) return { status: 'loading', data: null, fetchedAt: null };
      return {
        status: 'ready',
        fetchedAt: Date.now(),
        data: { candidates: [], totalValid: 0, totalApurados: 0, sectionsPercent: percent },
      };
    },
    getCandidates(office, uf, turn) {
      return this.getResults(office, uf, turn);
    },
    getLastUpdate: () => Date.now(),
  };
}

describe('SectionsByStateCard', () => {
  it('lista as UFs com dado disponível, ordenadas por percentual decrescente', () => {
    const app = new AppContext();
    app.state.dataMode = 'tse';
    app.tseProvider = fakeSectionsProvider({ SP: 41.57, RR: 98.2, AC: 70 });
    const html = SectionsByStateCard(app, 'presidente', 1);

    const order = [...html.matchAll(/title="[^"]*">([A-Z]{2})</g)].map((m) => m[1]);
    expect(order).toEqual(['RR', 'AC', 'SP']);
  });

  it('omite UFs sem dado — nunca inventa 0%', () => {
    const app = new AppContext();
    app.state.dataMode = 'tse';
    app.tseProvider = fakeSectionsProvider({ SP: 50 });
    const html = SectionsByStateCard(app, 'presidente', 1);

    expect(html).toContain('SP');
    expect(html).not.toContain('>AC<');
  });

  it('mostra um aviso, sem travar, quando nenhuma UF tem dado ainda', () => {
    const app = new AppContext();
    app.state.dataMode = 'tse';
    app.tseProvider = fakeSectionsProvider({});
    const html = SectionsByStateCard(app, 'presidente', 1);
    expect(html).toContain('ainda não disponíveis');
  });

  it('cargos fora de escopo (Senador/Deputados) não renderizam nada', () => {
    const app = new AppContext();
    expect(SectionsByStateCard(app, 'senador', 1)).toBe('');
    expect(SectionsByStateCard(app, 'deputadoFederal', 1)).toBe('');
  });
});
