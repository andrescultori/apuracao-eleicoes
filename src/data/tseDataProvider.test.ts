import { describe, expect, it, vi } from 'vitest';
import ea11Sample from './__fixtures__/ea11.sample.json';
import ea20Sample from './__fixtures__/ea20.sample.json';
import type { FetchLike } from './requestQueue';
import { RequestQueue } from './requestQueue';
import { createTseDataProvider, parseEa20Payload, type Ea20Payload } from './tseDataProvider';

describe('parseEa20Payload', () => {
  it('converte o payload em ElectionResults ordenado por votos', () => {
    const results = parseEa20Payload(ea20Sample as Ea20Payload, 'presidente', 'BR');
    expect(results.candidates).toHaveLength(2);
    expect(results.candidates[0]?.name).toBe('Candidato Um');
    expect(results.candidates[0]?.position).toBe(1);
    expect(results.candidates[1]?.position).toBe(2);
    expect(results.totalValid).toBe(950);
    expect(results.totalApurados).toBe(1000);
  });

  it('devolve lista vazia quando não há cargo no payload', () => {
    const results = parseEa20Payload({ ele: 1, t: 1, dg: '', hg: '', carg: [] }, 'presidente', 'BR');
    expect(results.candidates).toHaveLength(0);
  });
});

function fakeFetch(responses: Record<string, unknown>): FetchLike {
  return async (url: string) => {
    if (!(url in responses)) {
      return { ok: false, status: 404, headers: { get: () => null }, json: async () => null };
    }
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => responses[url] };
  };
}

describe('createTseDataProvider — fallback "dados indisponíveis"', () => {
  it('devolve status "error" quando o catálogo EA11 não pode ser obtido (404)', async () => {
    const queue = new RequestQueue({ fetchImpl: fakeFetch({}), intervalMs: 0 });
    const provider = createTseDataProvider(() => 'oficial', queue);

    provider.getResults('presidente', null, 1);
    await vi.waitFor(() => {
      const r = provider.getResults('presidente', null, 1);
      expect(r.status).toBe('error');
    });
  });

  it('devolve "unconfigured" quando o catálogo carrega mas o código de cargo não está confirmado', async () => {
    const queue = new RequestQueue({
      fetchImpl: fakeFetch({ 'https://resultados.tse.jus.br/oficial/comum/config/ele-c.json': ea11Sample }),
      intervalMs: 0,
    });
    const provider = createTseDataProvider(() => 'oficial', queue);

    provider.getResults('presidente', null, 1);
    await vi.waitFor(() => {
      const r = provider.getResults('presidente', null, 1);
      // TSE_CONFIG.officeCargoCode está vazio (código não confirmado) — nunca
      // deve inventar a URL do arquivo de resultado.
      expect(r.status).toBe('unconfigured');
      expect(r.data).toBeNull();
    });
  });

  it('nunca promove um resultado inexistente a "ready" sem os dois passos confirmados', async () => {
    const queue = new RequestQueue({ fetchImpl: fakeFetch({}), intervalMs: 0 });
    const provider = createTseDataProvider(() => 'oficial', queue);
    const r = provider.getResults('governador', 'SP', 1);
    expect(r.status).not.toBe('ready');
  });
});
