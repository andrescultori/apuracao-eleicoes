import { beforeAll, describe, expect, it, vi } from 'vitest';
import ea11Sample from './__fixtures__/ea11.sample.json';
import ea14Sample from './__fixtures__/ea14.sample.json';
import ea20Sample from './__fixtures__/ea20.sample.json';
import { parseEa11Catalog, resolveElection } from './ea11';
import type { FetchLike } from './requestQueue';
import { RequestQueue } from './requestQueue';
import { TSE_CONFIG } from './tseConfig';
import {
  createTseDataProvider,
  findAccompanimentSections,
  findElectorado,
  parseEa14Payload,
  parseEa20Payload,
  type Ea20Payload,
} from './tseDataProvider';

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
// `testPublicKey` são bytes brutos (Uint8Array) — é o que `getTseVerificationKey`
// devolve de verdade agora (ver nota em tseKeys.ts/jws.ts). `exportKey` aqui só
// serve pra montar a fixture do teste; o Node não tem o bug do WebKit que
// motivou a mudança.
let testPublicKey: Uint8Array;
let testPrivateKey: CryptoKey;

vi.mock('./tseKeys', () => ({
  getTseVerificationKey: () => ({
    kid: TEST_KID,
    rawPublicKey: testPublicKey,
  }),
}));

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  testPublicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
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

describe('parseEa14Payload / findAccompanimentSections', () => {
  it('faz o parsing do arquivo real de acompanhamento (abr[] com UFs + item "br")', () => {
    const payload = parseEa14Payload(ea14Sample);
    expect(payload.abr).toHaveLength(3);
    expect(payload.abr.map((a) => a.cdabr).sort()).toEqual(['br', 'pi', 'sp']);
  });

  it('encontra a entrada "br" (agregado nacional) quando uf é null', () => {
    const payload = parseEa14Payload(ea14Sample);
    const sections = findAccompanimentSections(payload, null);
    // valores reais do arquivo: s.ts="528951", s.st="528951" (100% totalizado).
    expect(sections).toEqual({ total: 528951, counted: 528951 });
  });

  it('encontra a entrada de uma UF específica, casando cdabr em minúsculo', () => {
    const payload = parseEa14Payload(ea14Sample);
    const sections = findAccompanimentSections(payload, 'SP');
    expect(sections).toEqual({ total: 106580, counted: 106580 });
  });

  it('devolve null quando a UF pedida não está no arquivo', () => {
    const payload = parseEa14Payload(ea14Sample);
    expect(findAccompanimentSections(payload, 'RJ')).toBeNull();
  });

  it('rejeita um payload sem "abr"', () => {
    expect(() => parseEa14Payload({})).toThrow();
  });

  it('faz o parsing do eleitorado ("e") quando presente, sem afetar as seções', () => {
    const payload = parseEa14Payload(ea14Sample);
    const br = payload.abr.find((a) => a.cdabr === 'br');
    // valores reais do arquivo: te=163079139, c=138863131, a=24215741.
    expect(br?.e).toEqual({ te: '163079139', c: '138863131', a: '24215741' });
  });

  it('não lança quando "e" está presente mas malformado — só omite o eleitorado', () => {
    const raw = JSON.parse(JSON.stringify(ea14Sample)) as { abr: Array<Record<string, unknown>> };
    const br = raw.abr.find((a) => a['cdabr'] === 'br');
    expect(br).toBeDefined();
    br!['e'] = { te: 'não é número', c: '1' }; // falta "a" e "te" não é numérico-string válido
    const payload = parseEa14Payload(raw);
    const parsedBr = payload.abr.find((a) => a.cdabr === 'br');
    expect(parsedBr?.e).toBeUndefined();
    // seções continuam funcionando normalmente, mesmo com "e" malformado.
    expect(findAccompanimentSections(payload, null)).toEqual({ total: 528951, counted: 528951 });
  });

  it('não lança quando "e" está totalmente ausente', () => {
    const raw = JSON.parse(JSON.stringify(ea14Sample)) as { abr: Array<Record<string, unknown>> };
    const br = raw.abr.find((a) => a['cdabr'] === 'br');
    delete br!['e'];
    const payload = parseEa14Payload(raw);
    const parsedBr = payload.abr.find((a) => a.cdabr === 'br');
    expect(parsedBr?.e).toBeUndefined();
  });
});

describe('findElectorado', () => {
  it('encontra o eleitorado nacional ("br") quando uf é null', () => {
    const payload = parseEa14Payload(ea14Sample);
    // te=163079139, c=138863131, a=24215741 — soma 163078872 (resíduo real de 267).
    expect(findElectorado(payload, null)).toEqual({ total: 163079139, accountedFor: 163078872 });
  });

  it('encontra o eleitorado de uma UF específica, casando cdabr em minúsculo', () => {
    const payload = parseEa14Payload(ea14Sample);
    // sp: te=35745722, c=30433191, a=5312531 — soma exatamente o total.
    expect(findElectorado(payload, 'SP')).toEqual({ total: 35745722, accountedFor: 35745722 });
  });

  it('encontra o eleitorado de outra UF (pi), confirmando que não é um valor fixo de teste', () => {
    const payload = parseEa14Payload(ea14Sample);
    // pi: te=2763829, c=2355142, a=408687 — soma exatamente o total.
    expect(findElectorado(payload, 'PI')).toEqual({ total: 2763829, accountedFor: 2763829 });
  });

  it('devolve null quando a UF pedida não está no arquivo', () => {
    const payload = parseEa14Payload(ea14Sample);
    expect(findElectorado(payload, 'RJ')).toBeNull();
  });

  it('devolve null quando a entrada existe mas não tem campo "e"', () => {
    const raw = JSON.parse(JSON.stringify(ea14Sample)) as { abr: Array<Record<string, unknown>> };
    const sp = raw.abr.find((a) => a['cdabr'] === 'sp');
    delete sp!['e'];
    const payload = parseEa14Payload(raw);
    expect(findElectorado(payload, 'SP')).toBeNull();
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

/** URL do EA20 (Governador/SP), derivada do próprio catálogo — nunca hardcoded. */
function governadorSpEa20Url(): string {
  const catalog = parseEa11Catalog(ea11Sample);
  const resolved = resolveElection(catalog, 'governador', 1);
  if (!resolved) throw new Error('fixture inválida: governador não resolveu no catálogo de teste');
  const url = TSE_CONFIG.buildResultPath('EA20', 'oficial', catalog, {
    office: 'governador',
    uf: 'SP',
    ciclo: resolved.ciclo,
    cdEleicao: resolved.cdEleicao,
  });
  if (!url) throw new Error('fixture inválida: não foi possível montar a URL do EA20 de teste');
  return url;
}

/**
 * URL do arquivo de acompanhamento (EA14, tipo "ab") de uma eleição — sempre
 * Brasil-scoped (um único arquivo cobre todas as UFs, ver findAccompanimentSections).
 */
function accompanimentUrl(office: Parameters<typeof resolveElection>[1]): string {
  const catalog = parseEa11Catalog(ea11Sample);
  const resolved = resolveElection(catalog, office, 1);
  if (!resolved) throw new Error(`fixture inválida: ${office} não resolveu no catálogo de teste`);
  const url = TSE_CONFIG.buildAccompanimentPath('oficial', catalog, {
    uf: null,
    ciclo: resolved.ciclo,
    cdEleicao: resolved.cdEleicao,
  });
  if (!url) throw new Error('fixture inválida: não foi possível montar a URL do acompanhamento de teste');
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
    const ea14Url = accompanimentUrl('presidente');
    const queue = new RequestQueue({
      fetchImpl: fakeFetch({
        [OFICIAL_EA11_URL]: await signEdDSA(ea11Sample),
        [ea20Url]: await signEdDSA(ea20Sample),
        [ea14Url]: await signEdDSA(ea14Sample),
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
      // Seções totalizadas vêm do acompanhamento (item "br", ver fixture real).
      expect(r.data?.sectionsTotal).toBe(528951);
      expect(r.data?.sectionsCounted).toBe(528951);
      // Eleitorado (item "br", ver fixture real) também vem do acompanhamento.
      expect(r.data?.electorateTotal).toBe(163079139);
      expect(r.data?.electorateAccountedFor).toBe(163078872);
    });
  });

  it('preenche sectionsTotal/sectionsCounted da UF certa para um cargo estadual (Governador/SP)', async () => {
    const ea20Url = governadorSpEa20Url();
    const ea14Url = accompanimentUrl('governador');
    const queue = new RequestQueue({
      fetchImpl: fakeFetch({
        [OFICIAL_EA11_URL]: await signEdDSA(ea11Sample),
        [ea20Url]: await signEdDSA(ea20Sample),
        [ea14Url]: await signEdDSA(ea14Sample),
      }),
      intervalMs: 0,
    });
    const provider = createTseDataProvider(() => 'oficial', queue);

    provider.getResults('governador', 'SP', 1);
    await vi.waitFor(() => {
      const r = provider.getResults('governador', 'SP', 1);
      expect(r.status).toBe('ready');
      // Entrada "sp" da fixture real: s.ts/s.st = "106580" (100% totalizado).
      expect(r.data?.sectionsTotal).toBe(106580);
      expect(r.data?.sectionsCounted).toBe(106580);
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
    // chama getResults de novo — o que dispara a busca do resultado EA20 e a
    // do arquivo de acompanhamento (não mockado nesta fixture, então dá 404).
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    const afterSecondRender = provider.getResults('presidente', null, 1);
    expect(afterSecondRender.status).not.toBe('ready');

    // Mais 2 notificações: acompanhamento (404 → "erro", não bloqueia) e
    // resultado EA20 (assinatura verificada) — em qualquer ordem entre si.
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(3));
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
