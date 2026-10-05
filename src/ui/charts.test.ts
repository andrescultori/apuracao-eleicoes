import { beforeEach, describe, expect, it } from 'vitest';
import type { CandidateResult, DataProvider, ElectionDataStatus, ProviderResult } from '../data/types';
import { AppContext } from '../state/appContext';
import { EvolutionChart, VoteChart } from './charts';

// O histórico do gráfico de evolução agora é persistido em localStorage (ver
// store.ts) — sem limpar entre testes, um `new AppContext()` carregaria o
// histórico deixado pelo teste anterior (jsdom mantém localStorage entre
// testes do mesmo arquivo).
beforeEach(() => {
  localStorage.clear();
});

/** `votes` casa com `percentage` sobre uma base de 100 (ver `totalValid: 100` em `sequencedProvider`) — `applyVoteBasis` recalcula o percentual a partir de votes/totalValid, então os dois precisam ser consistentes. */
function fakeCandidate(id: string, name: string, percentage: number): CandidateResult {
  return {
    id,
    name,
    ballotName: name,
    number: id,
    party: 'XYZ',
    state: 'BR',
    office: 'presidente',
    finalShare: 0,
    percentage,
    votes: percentage,
    position: 1,
  };
}

/**
 * Provedor fake cujo resultado muda a cada chamada, seguindo a lista
 * `snapshots` — simula o TSE publicando novos dados ao longo do tempo
 * (diferente dos outros testes com provedor fake, que devolvem sempre o
 * mesmo resultado).
 */
function sequencedProvider(snapshots: { fetchedAt: number; candidates: CandidateResult[] }[]): DataProvider {
  let call = 0;
  const next = (): ProviderResult => {
    const snap = snapshots[Math.min(call, snapshots.length - 1)]!;
    call++;
    return {
      status: 'ready',
      data: { candidates: snap.candidates, totalValid: 100, totalApurados: 100 },
      fetchedAt: snap.fetchedAt,
    };
  };
  return {
    getElectionData: (): ElectionDataStatus => ({ status: 'ready' }),
    getResults: next,
    getCandidates: next,
    getLastUpdate: () => null,
  };
}

describe('EvolutionChart — modo TSE', () => {
  it('mostra aviso de histórico insuficiente com menos de 2 pontos, dizendo desde quando acompanha', () => {
    const app = new AppContext();
    app.state.dataMode = 'tse';
    app.tseProvider = sequencedProvider([{ fetchedAt: 1000, candidates: [fakeCandidate('a', 'Candidato A', 50)] }]);
    app.getOfficeResults('presidente', null, 1); // 1º ponto registrado
    const html = EvolutionChart(app, 'presidente', 1, null);
    expect(html).toContain('Acompanhando esta corrida desde');
    expect(html).not.toContain('<svg');
  });

  it('mostra aviso genérico quando ainda não há nenhum ponto registrado', () => {
    const app = new AppContext();
    app.state.dataMode = 'tse';
    // Provedor "loading" (sem dado ainda) — getOfficeResults nunca chega a
    // registrar um ponto de histórico nesse caso.
    app.tseProvider = {
      getElectionData: (): ElectionDataStatus => ({ status: 'ready' }),
      getResults: (): ProviderResult => ({ status: 'loading', data: null, fetchedAt: null }),
      getCandidates: (): ProviderResult => ({ status: 'loading', data: null, fetchedAt: null }),
      getLastUpdate: () => null,
    };
    const html = EvolutionChart(app, 'presidente', 1, null);
    expect(html).toContain('Começando a acompanhar esta corrida agora');
    expect(html).not.toContain('<svg');
  });

  it('desenha o gráfico real a partir do histórico, depois de 2+ buscas espaçadas pelo intervalo mínimo', () => {
    const app = new AppContext();
    app.state.dataMode = 'tse';
    const FIVE_MIN = 5 * 60 * 1000;
    const T0 = 1_700_000_000_000; // timestamp realista (Date.now() nunca é 0)
    app.tseProvider = sequencedProvider([
      { fetchedAt: T0, candidates: [fakeCandidate('a', 'Candidato A', 40)] },
      { fetchedAt: T0 + FIVE_MIN, candidates: [fakeCandidate('a', 'Candidato A', 55)] },
    ]);
    app.getOfficeResults('presidente', null, 1);
    app.getOfficeResults('presidente', null, 1);
    const history = app.getResultsHistory('presidente', null, 1);
    expect(history).toHaveLength(2);
    expect(history[0]?.candidates[0]?.percentage).toBeCloseTo(40);
    expect(history[1]?.candidates[0]?.percentage).toBeCloseTo(55);

    const html = EvolutionChart(app, 'presidente', 1, null);
    expect(html).toContain('<svg');
    expect(html).toContain('Candidato A');
  });

  it('o SVG não tem min-width fixo — precisa encolher pra caber na tela, nunca vazar (ver overflow:hidden em .chart-card)', () => {
    const app = new AppContext();
    app.state.dataMode = 'tse';
    const T0 = 1_700_000_000_000;
    app.tseProvider = sequencedProvider([
      { fetchedAt: T0, candidates: [fakeCandidate('a', 'Candidato A', 40)] },
      { fetchedAt: T0 + 60_000, candidates: [fakeCandidate('a', 'Candidato A', 55)] },
    ]);
    app.getOfficeResults('presidente', null, 1);
    app.getOfficeResults('presidente', null, 1);
    const html = EvolutionChart(app, 'presidente', 1, null);
    expect(html).not.toContain('min-width');
  });

  it('limita o eixo X a poucos rótulos mesmo com um histórico bem mais longo (apuração de várias horas)', () => {
    const app = new AppContext();
    app.state.dataMode = 'tse';
    const T0 = 1_700_000_000_000;
    const ONE_MIN = 60_000;
    const snapshots = Array.from({ length: 20 }, (_, i) => ({
      fetchedAt: T0 + i * ONE_MIN,
      candidates: [fakeCandidate('a', 'Candidato A', 40 + i)],
    }));
    app.tseProvider = sequencedProvider(snapshots);
    for (let i = 0; i < 20; i++) app.getOfficeResults('presidente', null, 1);
    expect(app.getResultsHistory('presidente', null, 1)).toHaveLength(20);

    const html = EvolutionChart(app, 'presidente', 1, null);
    // `text-anchor="middle"` só aparece nos rótulos do eixo X (os do eixo Y
    // usam `text-anchor="end"`) — com 20 pontos, a regra antiga ("pula 1 a
    // cada 2") ainda mostraria ~10 rótulos; o limite novo (~6) deve segurar
    // isso não importa quantos pontos o histórico acumule.
    const xLabelCount = (html.match(/text-anchor="middle"/g) ?? []).length;
    expect(xLabelCount).toBeLessThanOrEqual(6);
    expect(xLabelCount).toBeGreaterThanOrEqual(2);
  });

  it('não duplica um ponto do histórico quando getOfficeResults é chamado de novo com o mesmo fetchedAt (um render sem dado novo)', () => {
    const app = new AppContext();
    app.state.dataMode = 'tse';
    app.tseProvider = sequencedProvider([{ fetchedAt: 1000, candidates: [fakeCandidate('a', 'Candidato A', 40)] }]);
    // Simula múltiplos renders entre buscas reais — fetchedAt não muda.
    app.getOfficeResults('presidente', null, 1);
    app.getOfficeResults('presidente', null, 1);
    app.getOfficeResults('presidente', null, 1);
    expect(app.getResultsHistory('presidente', null, 1)).toHaveLength(1);
  });

  it('não registra um ponto novo antes do intervalo mínimo (1 min) — eixo X mais largo que minuto a minuto', () => {
    const app = new AppContext();
    app.state.dataMode = 'tse';
    const T0 = 1_700_000_000_000; // timestamp realista (Date.now() nunca é 0)
    app.tseProvider = sequencedProvider([
      { fetchedAt: T0, candidates: [fakeCandidate('a', 'Candidato A', 40)] },
      // Autoatualização de 10s (o mínimo configurável) chegando com dado
      // novo bem antes do intervalo mínimo — não deveria virar um ponto novo.
      { fetchedAt: T0 + 10_000, candidates: [fakeCandidate('a', 'Candidato A', 41)] },
      { fetchedAt: T0 + 30_000, candidates: [fakeCandidate('a', 'Candidato A', 42)] },
    ]);
    app.getOfficeResults('presidente', null, 1);
    app.getOfficeResults('presidente', null, 1);
    app.getOfficeResults('presidente', null, 1);
    expect(app.getResultsHistory('presidente', null, 1)).toHaveLength(1);
  });

  it('o histórico sobrevive a um "recarregamento de página" (um novo AppContext lendo o localStorage do anterior)', () => {
    const T0 = 1_700_000_000_000;
    const FIVE_MIN = 5 * 60 * 1000;

    // "Sessão 1": primeira visita, só o 1º ponto é registrado.
    const app1 = new AppContext();
    app1.state.dataMode = 'tse';
    app1.tseProvider = sequencedProvider([{ fetchedAt: T0, candidates: [fakeCandidate('a', 'Candidato A', 40)] }]);
    app1.getOfficeResults('presidente', null, 1);
    expect(app1.getResultsHistory('presidente', null, 1)).toHaveLength(1);

    // "Recarrega a página" 5+ min depois: um AppContext NOVO (simulando main.ts
    // rodando de novo) deve enxergar o ponto da sessão anterior, carregado do
    // localStorage, e registrar o 2º ponto normalmente.
    const app2 = new AppContext();
    app2.state.dataMode = 'tse';
    app2.tseProvider = sequencedProvider([
      { fetchedAt: T0 + FIVE_MIN, candidates: [fakeCandidate('a', 'Candidato A', 55)] },
    ]);
    const historyBeforeNewFetch = app2.getResultsHistory('presidente', null, 1);
    expect(historyBeforeNewFetch).toHaveLength(1); // herdado da sessão 1, não perdido no "reload"

    app2.getOfficeResults('presidente', null, 1);
    const history = app2.getResultsHistory('presidente', null, 1);
    expect(history).toHaveLength(2);
    expect(history[0]?.candidates[0]?.percentage).toBeCloseTo(40);
    expect(history[1]?.candidates[0]?.percentage).toBeCloseTo(55);

    const html = EvolutionChart(app2, 'presidente', 1, null);
    expect(html).toContain('<svg');
  });
});

describe('VoteChart — selo de eleito matematicamente', () => {
  it('mostra o selo compacto no candidato marcado elected:true, e só nele', () => {
    const app = new AppContext();
    const elected: CandidateResult = { ...fakeCandidate('a', 'Candidato A', 70), elected: true };
    const notElected: CandidateResult = fakeCandidate('b', 'Candidato B', 30);
    const html = VoteChart(app, 'presidente', 1, null, {
      candidates: [elected, notElected],
      totalValid: 100,
      totalApurados: 100,
    });
    expect((html.match(/elected-badge-compact/g) ?? []).length).toBe(1);
  });

  it('não mostra o selo quando ninguém está marcado como eleito', () => {
    const app = new AppContext();
    const html = VoteChart(app, 'presidente', 1, null, {
      candidates: [fakeCandidate('a', 'Candidato A', 70)],
      totalValid: 100,
      totalApurados: 100,
    });
    expect(html).not.toContain('elected-badge-compact');
  });
});
