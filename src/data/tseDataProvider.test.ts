import { beforeAll, describe, expect, it, vi } from 'vitest';
import ea11Sample from './__fixtures__/ea11.sample.json';
import ea20Sample from './__fixtures__/ea20.sample.json';
import { parseEa11Catalog, resolveElection } from './ea11';
import type { FetchLike } from './requestQueue';
import { RequestQueue } from './requestQueue';
import { TSE_CONFIG } from './tseConfig';
import { createTseDataProvider, parseEa20Payload, type Ea20Payload } from './tseDataProvider';

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeString(s: string): string {
  return base64UrlEncode(new TextEncoder().encode(s));
}

/**
 * `tseDataProvider.ts` verifica a assinatura contra as chaves REAIS do TSE
 * (ver tseKeys.ts) — não temos a chave privada do TSE para assinar fixtures
 * de teste. Por isso `./tseKeys` é substituído por um par Ed25519 gerado só
 * para este arquivo, mantendo o resto do pipeline real (fetch → verifyJws →
 * parseEa11Catalog/parseEa20Payload → status) — nada aqui simula o resultado
 * da verificação, só a chave usada para verificar.
 */
const TEST_KID = 'test-kid';
let testPublicKey: CryptoKey;
let testPrivateKey: CryptoKey;

vi.mock('./tseKeys', () => ({
  getTseVerificationKey: () => ({
    kid: TEST_KID,
    keyPromise: Promise.resolve().then(() => testPublicKey),
  }),
}));

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
  testPublicKey = pair.publicKey;
  testPrivateKey = pair.privateKey;
});

async function signEdDSA(payload: unknown, kid: string = TEST_KID): Promise<string> {
  const header = { alg: 'EdDSA', kid, typ: 'JOSE' };
  const headerB64 = base64UrlEncodeString(JSON.stringify(header));
  const payloadB64 = base64UrlEncodeString(JSON.stringify(payload));
  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = await crypto.subtle.sign({ name: 'Ed25519' }, testPrivateKey, signingInput);
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));
  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

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

function fakeFetch(responses: Record<string, string>): FetchLike {
  return async (url: string) => {
    if (!(url in responses)) {
      return { ok: false, status: 404, headers: { get: () => null }, text: async () => '' };
    }
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => responses[url]! };
  };
}

const OFICIAL_EA11_URL = TSE_CONFIG.ea11Url('oficial');

/** URL do EA20 (Presidente/Brasil), derivada do próprio catálogo — nunca hardcoded. */
function presidenteEa20Url(): string {
  const catalog = parseEa11Catalog(ea11Sample);
  const resolved = resolveElection(catalog, 'presidente', 1);
  if (!resolved) throw new Error('fixture inválida: presidente não resolveu no catálogo de teste');
  const url = TSE_CONFIG.buildResultPath('EA20', 'oficial', catalog, {
    office: 'presidente',
    uf: null,
    ciclo: resolved.ciclo,
    cdEleicao: resolved.cdEleicao,
  });
  if (!url) throw new Error('fixture inválida: não foi possível montar a URL do EA20 de teste');
  return url;
}

describe('createTseDataProvider — verificação de assinatura ligada de ponta a ponta', () => {
  it('devolve status "error" quando o catálogo EA11 não pode ser obtido (404)', async () => {
    const queue = new RequestQueue({ fetchImpl: fakeFetch({}), intervalMs: 0 });
    const provider = createTseDataProvider(() => 'oficial', queue);

    provider.getResults('presidente', null, 1);
    await vi.waitFor(() => {
      const r = provider.getResults('presidente', null, 1);
      expect(r.status).toBe('error');
    });
  });

  it('nunca promove um resultado a "ready" quando o catálogo não está assinado (JSON puro, sem JWS)', async () => {
    const queue = new RequestQueue({
      fetchImpl: fakeFetch({ [OFICIAL_EA11_URL]: JSON.stringify(ea11Sample) }),
      intervalMs: 0,
    });
    const provider = createTseDataProvider(() => 'oficial', queue);

    provider.getResults('presidente', null, 1);
    await vi.waitFor(() => {
      const r = provider.getResults('presidente', null, 1);
      expect(r.status).toBe('error');
      expect(r.data).toBeNull();
    });
  });

  it('chega a "ready" com os dados corretos quando catálogo e resultado têm assinatura EdDSA válida', async () => {
    const ea20Url = presidenteEa20Url();
    const queue = new RequestQueue({
      fetchImpl: fakeFetch({
        [OFICIAL_EA11_URL]: await signEdDSA(ea11Sample),
        [ea20Url]: await signEdDSA(ea20Sample),
      }),
      intervalMs: 0,
    });
    const provider = createTseDataProvider(() => 'oficial', queue);

    provider.getResults('presidente', null, 1);
    await vi.waitFor(() => {
      const r = provider.getResults('presidente', null, 1);
      expect(r.status).toBe('ready');
      expect(r.data?.candidates).toHaveLength(2);
      expect(r.data?.candidates[0]?.name).toBe('CANDIDATO 9987');
    });
  });

  it('chama onUpdate quando a busca em segundo plano termina, guiando a UI sem polling', async () => {
    // Reproduz o bug real: a UI só re-renderiza (chamando getResults de novo)
    // em resposta a uma notificação, nunca sozinha. As outras "chega a
    // ready" acima chamam getResults repetidamente dentro do próprio
    // vi.waitFor, o que mascara esse problema (o polling do teste faz o
    // papel que só onUpdate deveria fazer). Aqui, getResults só é chamado de
    // novo depois que onUpdate dispara — simulando exatamente o que
    // AppContext faz (re-renderiza quando avisado, nunca por conta própria).
    const ea20Url = presidenteEa20Url();
    const queue = new RequestQueue({
      fetchImpl: fakeFetch({
        [OFICIAL_EA11_URL]: await signEdDSA(ea11Sample),
        [ea20Url]: await signEdDSA(ea20Sample),
      }),
      intervalMs: 0,
    });
    const onUpdate = vi.fn();
    const provider = createTseDataProvider(() => 'oficial', queue, onUpdate);

    const afterFirstRender = provider.getResults('presidente', null, 1);
    expect(afterFirstRender.status).not.toBe('ready');

    // 1ª notificação: catálogo EA11 terminou. Só agora uma "re-renderização"
    // chama getResults de novo — o que dispara a busca do resultado EA20.
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    const afterSecondRender = provider.getResults('presidente', null, 1);
    expect(afterSecondRender.status).not.toBe('ready');

    // 2ª notificação: resultado EA20 terminou (assinatura verificada).
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(2));
    const afterThirdRender = provider.getResults('presidente', null, 1);
    expect(afterThirdRender.status).toBe('ready');
    expect(afterThirdRender.data?.candidates).toHaveLength(2);
  });

  it('nunca promove a "ready" quando o arquivo de resultado foi adulterado depois de assinado', async () => {
    const ea20Url = presidenteEa20Url();
    const validEa20 = await signEdDSA(ea20Sample);
    const [headerB64, , signatureB64] = validEa20.split('.');
    const tamperedPayloadB64 = base64UrlEncodeString(JSON.stringify({ ...ea20Sample, carg: [] }));
    const tamperedEa20 = `${headerB64}.${tamperedPayloadB64}.${signatureB64}`;

    const queue = new RequestQueue({
      fetchImpl: fakeFetch({ [OFICIAL_EA11_URL]: await signEdDSA(ea11Sample), [ea20Url]: tamperedEa20 }),
      intervalMs: 0,
    });
    const provider = createTseDataProvider(() => 'oficial', queue);

    provider.getResults('presidente', null, 1);
    await vi.waitFor(() => {
      const r = provider.getResults('presidente', null, 1);
      expect(r.status).toBe('error');
      expect(r.data).toBeNull();
    });
  });

  it('nunca promove a "ready" quando o kid do arquivo de resultado é de outro ambiente/eleição', async () => {
    const ea20Url = presidenteEa20Url();
    const queue = new RequestQueue({
      fetchImpl: fakeFetch({
        [OFICIAL_EA11_URL]: await signEdDSA(ea11Sample),
        [ea20Url]: await signEdDSA(ea20Sample, 'kid-de-outro-ambiente'),
      }),
      intervalMs: 0,
    });
    const provider = createTseDataProvider(() => 'oficial', queue);

    provider.getResults('presidente', null, 1);
    await vi.waitFor(() => {
      const r = provider.getResults('presidente', null, 1);
      expect(r.status).toBe('error');
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
