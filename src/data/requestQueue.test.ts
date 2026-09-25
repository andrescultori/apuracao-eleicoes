import { describe, expect, it, vi } from 'vitest';
import { RequestQueue, type FetchLike } from './requestQueue';

describe('RequestQueue', () => {
  it('busca e armazena em cache o corpo, ETag e Last-Modified de uma resposta OK', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: (n: string) => (n === 'ETag' ? 'W/"1"' : n === 'Last-Modified' ? 'yesterday' : null) },
      json: async () => ({ hello: 'world' }),
    }));
    const queue = new RequestQueue({ fetchImpl, intervalMs: 0 });

    const entry = await queue.fetchJson('https://example.test/a.json');
    expect(entry.body).toEqual({ hello: 'world' });
    expect(entry.etag).toBe('W/"1"');
    expect(entry.notFound).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('nunca repete uma URL que respondeu 404', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => ({
      ok: false,
      status: 404,
      headers: { get: () => null },
      json: async () => null,
    }));
    const queue = new RequestQueue({ fetchImpl, intervalMs: 0 });

    const first = await queue.fetchJson('https://example.test/missing.json');
    const second = await queue.fetchJson('https://example.test/missing.json');

    expect(first.notFound).toBe(true);
    expect(second.notFound).toBe(true);
    // A segunda chamada deve vir do cache, sem nova requisição de rede.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('processa requisições em série (concorrência 1), nunca em paralelo', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchImpl: FetchLike = vi.fn(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({}) };
    });
    const queue = new RequestQueue({ fetchImpl, intervalMs: 0 });

    await Promise.all([
      queue.fetchJson('https://example.test/1.json'),
      queue.fetchJson('https://example.test/2.json'),
      queue.fetchJson('https://example.test/3.json'),
    ]);

    expect(maxInFlight).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('tenta de novo com backoff em erro de rede, e resolve se a tentativa seguinte funcionar', async () => {
    let calls = 0;
    const fetchImpl: FetchLike = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error('network down');
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ ok: true }) };
    });
    const queue = new RequestQueue({ fetchImpl, intervalMs: 0, maxRetries: 1, backoffBaseMs: 1 });

    const entry = await queue.fetchJson('https://example.test/flaky.json');
    expect(entry.body).toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  it('rejeita depois de esgotar as tentativas em erro de rede persistente', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => {
      throw new Error('always down');
    });
    const queue = new RequestQueue({ fetchImpl, intervalMs: 0, maxRetries: 1, backoffBaseMs: 1 });

    await expect(queue.fetchJson('https://example.test/down.json')).rejects.toThrow('always down');
  });

  it('usa If-None-Match no cache e trata 304 devolvendo a entrada em cache', async () => {
    let call = 0;
    const fetchImpl: FetchLike = vi.fn(async (_url, init) => {
      call++;
      if (call === 1) {
        return {
          ok: true,
          status: 200,
          headers: { get: (n: string) => (n === 'ETag' ? 'abc' : null) },
          json: async () => ({ v: 1 }),
        };
      }
      expect(init?.headers?.['If-None-Match']).toBe('abc');
      return { ok: false, status: 304, headers: { get: () => null }, json: async () => null };
    });
    const queue = new RequestQueue({ fetchImpl, intervalMs: 0 });

    const first = await queue.fetchJson('https://example.test/cached.json');
    const second = await queue.fetchJson('https://example.test/cached.json');
    expect(first.body).toEqual({ v: 1 });
    expect(second.body).toEqual({ v: 1 });
  });
});
