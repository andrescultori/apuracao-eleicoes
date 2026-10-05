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
  parseGenerationTimestamp,
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

describe('parseGenerationTimestamp', () => {
  it('converte "DD/MM/AAAA" + "HH:MM:SS" (horário de Brasília, UTC-3 fixo) pro timestamp correto', () => {
    const ts = parseGenerationTimestamp('28/09/2026', '15:51:39');
    expect(ts).not.toBeNull();
    expect(new Date(ts!).toISOString()).toBe('2026-09-28T18:51:39.000Z');
  });

  it('devolve null pra formato inesperado, em vez de lançar ou inventar uma data', () => {
    expect(parseGenerationTimestamp('', '')).toBeNull();
    expect(parseGenerationTimestamp('2026-09-28', '15:51:39')).toBeNull();
    expect(parseGenerationTimestamp('28/09/2026', '15:51')).toBeNull();
  });
});

describe('parseEa14Payload / findAccompanimentSections', () => {
  it('faz o parsing do arquivo real de acompanhamento (abr[] com UFs + item "br")', () => {
    const payload = parseEa14Payload(ea14Sample);
    expect(payload.abr).toHaveLength(3);
    expect(payload.abr.map((a) => a.cdabr).sort()).toEqual(['br', 'pi', 'sp']);
  });

  it('soma as seções de todas as UFs (não confia na entrada "br") quando uf é null', () => {
    const payload = parseEa14Payload(ea14Sample);
    const sections = findAccompanimentSections(payload, null);
    // Soma de pi (ts=st=11803) + sp (ts=st=106580) — a entrada "br" do
    // arquivo (ts=st=528951, o total real de todas as 27 UFs) é ignorada de
    // propósito: ver nota em `findAccompanimentSections` sobre a divergência
    // confirmada em produção entre o percentual de "br" e o oficial.
    expect(sections).toEqual({ total: 118383, counted: 118383, percent: 100 });
  });

  it('encontra a entrada de uma UF específica, casando cdabr em minúsculo', () => {
    const payload = parseEa14Payload(ea14Sample);
    const sections = findAccompanimentSections(payload, 'SP');
    expect(sections).toEqual({ total: 106580, counted: 106580, percent: 100 });
  });

  it('faz o parsing de pstn com vírgula decimal (ex.: "41,57"), não só valores inteiros — escopo de UF', () => {
    // O escopo nacional (uf === null) não lê mais "pstn" (ver nota acima);
    // esse campo só é usado para uma UF específica, então o teste de
    // regressão da vírgula decimal mutou para o escopo de UF.
    const raw = JSON.parse(JSON.stringify(ea14Sample)) as { abr: Array<Record<string, unknown>> };
    const sp = raw.abr.find((a) => a['cdabr'] === 'sp')!;
    (sp['s'] as Record<string, unknown>)['pstn'] = '41,57';
    const payload = parseEa14Payload(raw);
    const sections = findAccompanimentSections(payload, 'SP');
    expect(sections?.percent).toBeCloseTo(41.57);
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
    // seções continuam funcionando normalmente, mesmo com "e" malformado
    // (nem é lido: o escopo nacional soma as UFs, não a entrada "br").
    expect(findAccompanimentSections(payload, null)).toEqual({ total: 118383, counted: 118383, percent: 100 });
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
      // Seções totalizadas vêm do acompanhamento, somadas pelas entradas de
      // UF (pi + sp na fixture real) — não da entrada "br" (ver nota em
      // `findAccompanimentSections`).
      expect(r.data?.sectionsTotal).toBe(118383);
      expect(r.data?.sectionsCounted).toBe(118383);
      // Eleitorado (item "br", ver fixture real) também vem do acompanhamento.
      expect(r.data?.electorateTotal).toBe(163079139);
      expect(r.data?.electorateAccountedFor).toBe(163078872);
    });
  });

  it('usa a data/hora real de geração do EA20 (dg/hg) como fetchedAt, não o relógio local de quem consulta', async () => {
    // Bug real: fetchedAt vinha de `Date.now()` (hora de quem está olhando a
    // tela), não da hora em que o TSE gerou aquele resultado — then o
    // gráfico de evolução, consultado bem depois da apuração já ter
    // terminado (ex.: no dia seguinte), mostrava só a janela de "agora" em
    // vez da linha do tempo real da apuração. ea20.sample.json tem
    // dg="28/09/2026" hg="15:51:39" — bem diferente de "agora".
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

    const realNow = Date.now();
    provider.getResults('presidente', null, 1);
    await vi.waitFor(() => {
      const r = provider.getResults('presidente', null, 1);
      expect(r.status).toBe('ready');
      expect(r.fetchedAt).toBe(parseGenerationTimestamp('28/09/2026', '15:51:39'));
      // Garante que não é coincidência — o timestamp real do teste rodando
      // é bem posterior ao da fixture (2026-09-28), então os dois nunca
      // colidiriam por acaso.
      expect(r.fetchedAt).toBeLessThan(realNow);
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

  it('rebusca o acompanhamento (EA14) periodicamente — não trava no primeiro valor obtido', async () => {
    // Bug real: "seções totalizadas" ficava divergindo cada vez mais do site
    // oficial ao longo do dia, mesmo com a fórmula do percentual já correta —
    // causa raiz era `ensureAccompaniment` nunca tentar de novo depois da
    // primeira busca bem-sucedida (diferente do resultado/EA20, que sempre
    // rebusca respeitando o cooldown). Este teste simula o TSE publicando
    // mais seções totalizadas num instante posterior e confirma que uma nova
    // chamada a getResults, depois do cooldown, reflete o valor atualizado.
    const ea20Url = presidenteEa20Url();
    const ea14Url = accompanimentUrl('presidente');

    const earlyPayload = JSON.parse(JSON.stringify(ea14Sample)) as {
      abr: Array<{ cdabr: string; s: Record<string, string> }>;
    };
    const piEarly = earlyPayload.abr.find((a) => a.cdabr === 'pi')!;
    piEarly.s['st'] = '5000'; // pi ainda não totalizado (ts continua 11803)

    const responses: Record<string, string> = {
      [OFICIAL_EA11_URL]: await signEdDSA(ea11Sample),
      [ea20Url]: await signEdDSA(ea20Sample),
      [ea14Url]: await signEdDSA(earlyPayload),
    };
    const queue = new RequestQueue({ fetchImpl: fakeFetch(responses), intervalMs: 0 });
    const provider = createTseDataProvider(() => 'oficial', queue);

    let now = Date.now();
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      provider.getResults('presidente', null, 1);
      await vi.waitFor(() => {
        const r = provider.getResults('presidente', null, 1);
        expect(r.status).toBe('ready');
        // pi parcial (5000) + sp completo (106580).
        expect(r.data?.sectionsCounted).toBe(111580);
      });

      // TSE "publica" mais seções totalizadas; relógio avança além do
      // cooldown de novas tentativas.
      responses[ea14Url] = await signEdDSA(ea14Sample);
      now += 6000;

      provider.getResults('presidente', null, 1);
      await vi.waitFor(() => {
        const r = provider.getResults('presidente', null, 1);
        // pi completo (11803) + sp completo (106580) — não trava em 111580.
        expect(r.data?.sectionsCounted).toBe(118383);
      });
    } finally {
      nowSpy.mockRestore();
    }
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
