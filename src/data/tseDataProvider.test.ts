import { describe, expect, it, vi } from 'vitest';
import ea11Sample from './__fixtures__/ea11.sample.json';
import ea20Sample from './__fixtures__/ea20.sample.json';
import type { FetchLike } from './requestQueue';
import { RequestQueue } from './requestQueue';
import { createTseDataProvider, parseEa20Payload, type Ea20Payload } from './tseDataProvider';

describe('parseEa20Payload', () => {
  it('converte o payload em ElectionResults ordenado por votos (schema real, valores em string)', () => {
    const results = parseEa20Payload(ea20Sample as Ea20Payload, 'presidente', 'BR');
    expect(results.candidates).toHaveLength(2);
    expect(results.candidates[0]?.name).toBe('CANDIDATO 9987');
    expect(results.candidates[0]?.votes).toBe(600);
    expect(results.candidates[0]?.position).toBe(1);
    expect(results.candidates[1]?.position).toBe(2);
    // pvapn usa vírgula decimal ("63,157894737") — precisa virar 63.157894737.
    expect(results.candidates[0]?.percentage).toBeCloseTo(63.157894737, 6);
    expect(results.totalValid).toBe(950);
    expect(results.totalApurados).toBe(1000);
  });

  it('devolve lista vazia quando não há cargo no payload', () => {
    const results = parseEa20Payload(
      { ele: '1', t: '1', dg: '', hg: '', v: { tv: '0', vv: '0' }, carg: [] },
      'presidente',
      'BR',
    );
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

const OFICIAL_EA11_URL = 'https://resultados.tse.jus.br/oficial/comum/config/ele-c.jws';

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

  it('busca o EA20 real mas nunca promove a "ready" sem verificar a assinatura', async () => {
    // Presidente resolve para a eleição 6257 (tp federal) no fixture do EA11 —
    // ver ea11.sample.json. A URL do EA20 já é construível de ponta a ponta
    // agora que o código de cargo está confirmado (TSE_CONFIG.officeCargoCode).
    const ea20Url = 'https://resultados.tse.jus.br/oficial/6257/dados/br/br-c0001-e006257-u.jws';
    const queue = new RequestQueue({
      fetchImpl: fakeFetch({ [OFICIAL_EA11_URL]: ea11Sample, [ea20Url]: ea20Sample }),
      intervalMs: 0,
    });
    const provider = createTseDataProvider(() => 'oficial', queue);

    provider.getResults('presidente', null, 1);
    await vi.waitFor(() => {
      const r = provider.getResults('presidente', null, 1);
      // O arquivo foi obtido com sucesso, mas sem a chave pública real do TSE
      // para verificar a assinatura EdDSA, os dados nunca viram "ready".
      expect(r.status).toBe('unconfigured');
      expect(r.data).toBeNull();
    });
  });

  it('nunca promove um resultado inexistente a "ready" sem o catálogo e o arquivo confirmados', async () => {
    const queue = new RequestQueue({ fetchImpl: fakeFetch({}), intervalMs: 0 });
    const provider = createTseDataProvider(() => 'oficial', queue);
    const r = provider.getResults('governador', 'SP', 1);
    expect(r.status).not.toBe('ready');
  });
});
