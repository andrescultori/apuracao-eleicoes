import { describe, expect, it } from 'vitest';
import type { CandidateResult, DataProvider, ElectionDataStatus, ProviderResult } from '../data/types';
import { AppContext } from '../state/appContext';
import { BrazilMap, supportsMap } from './brazilMap';

function fakeCandidate(id: string, party: string, votes: number, elected?: boolean): CandidateResult {
  return {
    id,
    name: `Candidato ${id}`,
    ballotName: `CANDIDATO ${id}`,
    number: id,
    party,
    state: 'BR',
    office: 'presidente',
    finalShare: 0,
    percentage: 0,
    votes,
    position: 1,
    elected,
  };
}

/** Provedor fake cujo resultado por UF é definido numa tabela — simula um mapa com UFs já decididas, só lideradas e sem dado nenhum. */
function fakePerUfProvider(byUf: Record<string, CandidateResult[]>): DataProvider {
  return {
    getElectionData: (): ElectionDataStatus => ({ status: 'ready' }),
    getResults: (_office, uf, _turn): ProviderResult => {
      const candidates = uf ? byUf[uf] : undefined;
      if (!candidates) return { status: 'loading', data: null, fetchedAt: null };
      return {
        status: 'ready',
        fetchedAt: Date.now(),
        data: { candidates, totalValid: 1000, totalApurados: 1000 },
      };
    },
    getCandidates(office, uf, turn) {
      return this.getResults(office, uf, turn);
    },
    getLastUpdate: () => Date.now(),
  };
}

describe('supportsMap', () => {
  it('só Presidente e Governador têm mapa', () => {
    expect(supportsMap('presidente')).toBe(true);
    expect(supportsMap('governador')).toBe(true);
    expect(supportsMap('senador')).toBe(false);
    expect(supportsMap('deputadoFederal')).toBe(false);
    expect(supportsMap('deputadoEstadual')).toBe(false);
  });
});

describe('BrazilMap', () => {
  it('renderiza uma célula clicável para cada uma das 27 UFs', () => {
    const app = new AppContext();
    app.state.dataMode = 'tse';
    app.tseProvider = fakePerUfProvider({});
    const html = BrazilMap(app, 'presidente', 1);
    const matches = html.match(/data-action="set-map-uf"/g) ?? [];
    // 27 células + eventualmente o botão "voltar para Brasil" (não aparece aqui, pois não há filtro ativo).
    expect(matches.length).toBe(27);
  });

  it('usa a cor "decidida" (escura) só quando elected:true, e a cor "em aberto" (clara) quando só lidera', () => {
    const app = new AppContext();
    app.state.dataMode = 'tse';
    app.tseProvider = fakePerUfProvider({
      SP: [fakeCandidate('1', 'PT', 900, true)],
      RR: [fakeCandidate('2', 'PL', 600, false)],
    });
    const html = BrazilMap(app, 'presidente', 1);

    const spCell = html.match(/<button[^>]*data-value="SP"[^>]*>/)?.[0] ?? '';
    const rrCell = html.match(/<button[^>]*data-value="RR"[^>]*>/)?.[0] ?? '';
    expect(spCell).toContain('40%)'); // luminosidade baixa (decidido)
    expect(rrCell).toContain('84%)'); // luminosidade alta (em aberto)
    expect(spCell).not.toContain('no-data');
    expect(rrCell).not.toContain('no-data');
  });

  it('UFs sem dado nenhum ficam com a cor neutra e a classe "no-data"', () => {
    const app = new AppContext();
    app.state.dataMode = 'tse';
    app.tseProvider = fakePerUfProvider({ SP: [fakeCandidate('1', 'PT', 900, true)] });
    const html = BrazilMap(app, 'presidente', 1);

    const acCell = html.match(/<button[^>]*data-value="AC"[^>]*>/)?.[0] ?? '';
    expect(acCell).toContain('no-data');
    expect(acCell).toContain('var(--surface-2)');
  });

  it('marca a UF selecionada via nationalUfFilter (Presidente) com aria-pressed="true" e mostra o botão de voltar', () => {
    const app = new AppContext();
    app.state.dataMode = 'tse';
    app.state.nationalUfFilter = 'SP';
    app.tseProvider = fakePerUfProvider({ SP: [fakeCandidate('1', 'PT', 900, true)] });
    const html = BrazilMap(app, 'presidente', 1);

    const spCell = html.match(/<button[^>]*data-value="SP"[^>]*>/)?.[0] ?? '';
    expect(spCell).toContain('aria-pressed="true"');
    expect(spCell).toContain('selected');
    expect(html).toContain('Voltar para Brasil');
  });

  it('sem filtro ativo (Presidente), nenhuma UF aparece selecionada e o botão de voltar não aparece', () => {
    const app = new AppContext();
    app.state.dataMode = 'tse';
    app.tseProvider = fakePerUfProvider({});
    const html = BrazilMap(app, 'presidente', 1);

    expect(html).not.toContain('Voltar para Brasil');
    expect(html).not.toContain('aria-pressed="true"');
  });

  it('Governador sempre tem alguma UF selecionada (reaproveita o seletor padrão) e nunca mostra "voltar para Brasil"', () => {
    const app = new AppContext();
    app.state.dataMode = 'tse';
    app.state.uf = 'PR';
    app.tseProvider = fakePerUfProvider({ PR: [fakeCandidate('1', 'PT', 900, true)] });
    const html = BrazilMap(app, 'governador', 1);

    const prCell = html.match(/<button[^>]*data-value="PR"[^>]*>/)?.[0] ?? '';
    expect(prCell).toContain('aria-pressed="true"');
    expect(html).not.toContain('Voltar para Brasil');
  });

  it('cargos fora de escopo (Senador/Deputados) não renderizam nada', () => {
    const app = new AppContext();
    expect(BrazilMap(app, 'senador', 1)).toBe('');
    expect(BrazilMap(app, 'deputadoFederal', 1)).toBe('');
    expect(BrazilMap(app, 'deputadoEstadual', 1)).toBe('');
  });
});
