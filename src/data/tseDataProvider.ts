import { parseEa11Catalog, resolveElection, type Ea11Catalog } from './ea11';
import { verifyJws } from './jws';
import { RequestQueue } from './requestQueue';
import { TSE_CONFIG, type TseEnvKey } from './tseConfig';
import { getTseVerificationKey } from './tseKeys';
import type {
  CandidateResult,
  DataProvider,
  ElectionDataStatus,
  ElectionResults,
  OfficeKey,
  ProviderResult,
  ProviderStatus,
  Turn,
} from './types';

/**
 * Provedor real de dados do TSE.
 *
 * Funciona de ponta a ponta desde 29/09/2026: busca o catálogo de eleições
 * (EA11), verifica a assinatura EdDSA do envelope `.jws` (ver jws.ts e
 * tseKeys.ts), resolve dinamicamente o código de eleição de cada cargo (nunca
 * por um código fixo — ver ea11.ts), monta a URL do arquivo de resultado a
 * partir do template publicado pelo próprio catálogo (ver tseConfig.ts) e
 * verifica a assinatura desse arquivo também antes de aceitar os dados.
 *
 * Falha de assinatura (arquivo adulterado, chave/ambiente errado, algoritmo
 * inesperado) em qualquer etapa ⇒ os dados nunca são aceitos; o último
 * resultado válido em cache é preservado, e o status vira 'error'.
 */

/**
 * Formato real do payload do arquivo EA20 (resultado unificado), confirmado
 * ao vivo em 28/09/2026 a partir de um arquivo real do simulado
 * (`br-c0001-e021270-u.jws`, Presidente/Brasil) — ver nota de fontes em
 * tseConfig.ts. Todos os valores vêm como STRING no JSON original, inclusive
 * números e percentuais (que usam vírgula decimal, ex.: "7,566106610").
 */
export interface Ea20Vice {
  tp: string;
  sqcand: string;
  nm: string;
  nmu: string;
  sgp: string;
}

export interface Ea20Candidato {
  n: string; // número de urna
  sqcand: string; // identificador estável do candidato
  nm: string;
  nmu: string; // nome de urna
  dvt?: string; // destinação do voto: "Válido" | "Anulado" | "Anulado sub judice"
  vap: string; // votos (string numérica)
  pvapn: string; // percentual de votos, decimal com vírgula (ex.: "7,566106610")
  vs?: Ea20Vice[];
}

export interface Ea20Partido {
  n: string;
  sg: string; // sigla do partido
  nm: string;
  cand: Ea20Candidato[];
}

export interface Ea20Agrupamento {
  n: string;
  nm: string;
  tp: string;
  par: Ea20Partido[];
}

export interface Ea20Cargo {
  cd: string; // código de cargo (mesmo de TSE_CONFIG.officeCargoCode, como string)
  agr: Ea20Agrupamento[];
}

export interface Ea20Payload {
  ele: string;
  t: string;
  dg: string;
  hg: string;
  idg?: string;
  /** Totais de voto da corrida inteira — não por cargo (cada arquivo já é de um único cargo). */
  v: { tv: string; vv: string };
  carg: Ea20Cargo[];
}

/** Converte "7,566106610" (vírgula decimal) para 7.566106610. */
function parsePtDecimal(s: string): number {
  return Number(s.replace(',', '.'));
}

/**
 * Converte o payload (já verificado — ver jws.ts) do EA20 para o modelo
 * interno da aplicação. Função pura, testável com fixtures.
 */
export function parseEa20Payload(payload: Ea20Payload, office: OfficeKey, state: string): ElectionResults {
  const cargo = payload.carg[0];
  if (!cargo) return { candidates: [], totalValid: 0, totalApurados: 0 };

  const candidates: CandidateResult[] = [];
  for (const agr of cargo.agr) {
    for (const par of agr.par) {
      for (const c of par.cand) {
        candidates.push({
          id: c.sqcand,
          name: c.nm,
          ballotName: c.nmu,
          number: c.n,
          party: par.sg,
          state,
          office,
          finalShare: 0,
          votes: Number(c.vap),
          percentage: parsePtDecimal(c.pvapn),
          position: 0,
        });
      }
    }
  }
  candidates.sort((a, b) => b.votes - a.votes);
  candidates.forEach((c, i) => {
    c.position = i + 1;
  });

  return {
    candidates,
    totalValid: Number(payload.v.vv),
    totalApurados: Number(payload.v.tv),
  };
}

/**
 * Formato real do payload do arquivo EA14/EA15 (acompanhamento, tipo de
 * arquivo "ab"), confirmado ao vivo em 29/09/2026 a partir de um arquivo real
 * do simulado (`br-e021270-ab.jws`, Presidente) — ver nota de fontes em
 * tseConfig.ts. Um único arquivo Brasil-scoped já traz as 27 UFs (mais "zz",
 * provavelmente exterior) dentro de `abr[]` — não é preciso buscar o `-ab`
 * por UF (nunca observado no tráfego, só no JS do app).
 */
export interface Ea14Secoes {
  /** Seções totais. */
  ts: string;
  /** Seções totalizadas. */
  st: string;
  /** Percentual de seções totalizadas, decimal com vírgula (ex.: "100,00"). */
  pst: string;
  /** Como `pst`, mas com mais casas decimais — usado para o cálculo. */
  pstn: string;
}

/**
 * Eleitorado do escopo (UF ou Brasil), presente no mesmo arquivo real usado
 * para `Ea14Secoes`. `te` é o eleitorado total apto
 * a votar; `c`/`a` (comparecimento/abstenção) são acumulados só nas seções
 * já totalizadas — por isso `te - (c + a)` é o teto de eleitores cujo voto
 * ainda não foi contabilizado, usado em `electionMath.ts`. Campo opcional:
 * nem todo payload precisa ter esse detalhe para "seções totalizadas"
 * continuar funcionando (ver `Ea14AbrItem.e`).
 */
export interface Ea14Eleitorado {
  /** Eleitorado total do escopo — assumido fixo, independente da apuração (não confirmado com uma amostra parcial real). */
  te: string;
  /** Comparecimento acumulado nas seções já totalizadas. */
  c: string;
  /** Abstenção acumulada nas seções já totalizadas. */
  a: string;
}

export interface Ea14AbrItem {
  /** "uf" (27 UFs + "zz", provavelmente exterior) ou "br" (agregado nacional). */
  tpabr: string;
  /** Sigla da UF em minúsculo (ex.: "sp") quando `tpabr==="uf"`; "br" quando `tpabr==="br"`. */
  cdabr: string;
  s: Ea14Secoes;
  e?: Ea14Eleitorado;
}

export interface Ea14Payload {
  ele: string;
  t: string;
  abr: Ea14AbrItem[];
}

export interface AccompanimentSections {
  total: number;
  counted: number;
  /** Percentual de seções totalizadas já calculado pelo TSE (campo `pstn`) — ver nota em `ElectionResults.sectionsPercent`. */
  percent: number;
}

export class Ea14ParseError extends Error {}

/**
 * Valida e converte o JSON bruto do EA14 (já decodificado do JWS) para
 * `Ea14Payload`. Lança `Ea14ParseError` para qualquer formato inesperado —
 * nunca aceita um payload parcialmente reconhecido como se fosse válido.
 */
export function parseEa14Payload(raw: unknown): Ea14Payload {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as Record<string, unknown>)['abr'])) {
    throw new Ea14ParseError('EA14: formato inesperado (campo "abr" ausente ou não é lista)');
  }
  const rawAbr = (raw as Record<string, unknown>)['abr'] as unknown[];
  const abr = rawAbr.map((item): Ea14AbrItem => {
    if (typeof item !== 'object' || item === null) {
      throw new Ea14ParseError('EA14: item de abr[] com formato inesperado');
    }
    const rec = item as Record<string, unknown>;
    const s = rec['s'];
    if (typeof rec['tpabr'] !== 'string' || typeof rec['cdabr'] !== 'string' || typeof s !== 'object' || s === null) {
      throw new Ea14ParseError('EA14: item de abr[] sem tpabr/cdabr/s válidos');
    }
    const secoes = s as Record<string, unknown>;
    if (typeof secoes['ts'] !== 'string' || typeof secoes['st'] !== 'string' || typeof secoes['pstn'] !== 'string') {
      throw new Ea14ParseError('EA14: campo "s" sem ts/st/pstn válidos');
    }
    const eRaw = rec['e'];
    let eleitorado: Ea14Eleitorado | undefined;
    if (typeof eRaw === 'object' && eRaw !== null) {
      const eRec = eRaw as Record<string, unknown>;
      if (typeof eRec['te'] === 'string' && typeof eRec['c'] === 'string' && typeof eRec['a'] === 'string') {
        eleitorado = { te: eRec['te'], c: eRec['c'], a: eRec['a'] };
      }
      // Se "e" existir mas sem te/c/a válidos, segue sem eleitorado — nunca
      // lança por causa disso, já que "seções totalizadas" não depende dele.
    }
    return {
      tpabr: rec['tpabr'],
      cdabr: rec['cdabr'],
      s: { ts: secoes['ts'], st: secoes['st'], pst: String(secoes['pst'] ?? ''), pstn: secoes['pstn'] },
      e: eleitorado,
    };
  });
  return {
    ele:
      typeof (raw as Record<string, unknown>)['ele'] === 'string'
        ? ((raw as Record<string, unknown>)['ele'] as string)
        : '',
    t:
      typeof (raw as Record<string, unknown>)['t'] === 'string'
        ? ((raw as Record<string, unknown>)['t'] as string)
        : '',
    abr,
  };
}

/**
 * Localiza, em `abr[]`, a entrada certa para o escopo pedido — a da UF
 * (`cdabr` casado em minúsculo) quando `uf` não é `null`. Devolve `null`
 * quando essa entrada específica não está no arquivo (nunca inventa um
 * número).
 *
 * Para `uf === null` (visão Brasil, só existe para Presidente), NÃO usa a
 * entrada agregada "br" do próprio arquivo — confirmado (relato real em
 * produção, pleito de 04/10/2026) que o percentual de "br" diverge bastante
 * do site oficial (ex.: 64% no app vs 47% oficial), enquanto o percentual de
 * cada UF individualmente bate. Isso é consistente com "br" sendo uma MÉDIA
 * (não ponderada pelo tamanho de cada UF) dos percentuais estaduais — estados
 * pequenos terminando a totalização mais rápido pesariam igual a SP/MG,
 * inflando a média bem acima do percentual nacional real. Em vez de confiar
 * nisso, somamos `ts`/`st` de todas as entradas `tpabr==='uf'` (as mesmas já
 * confirmadas corretas individualmente) e calculamos o percentual nacional
 * ponderado nós mesmos — é a soma bruta de seções, não dá pra estar errada
 * da mesma forma que uma média de percentuais.
 */
export function findAccompanimentSections(payload: Ea14Payload, uf: string | null): AccompanimentSections | null {
  if (uf) {
    const item = payload.abr.find((a) => a.tpabr === 'uf' && a.cdabr === uf.toLowerCase());
    if (!item) return null;
    // `pstn` já é o percentual calculado pelo próprio TSE — nunca recalculado
    // aqui a partir de ts/st (ver nota em `ElectionResults.sectionsPercent`).
    // É decimal com vírgula (ex.: "41,57"), por isso usa `parsePtDecimal`
    // como os demais campos decimais do TSE — `Number()` direto dá NaN.
    return { total: Number(item.s.ts), counted: Number(item.s.st), percent: parsePtDecimal(item.s.pstn) };
  }
  const ufItems = payload.abr.filter((a) => a.tpabr === 'uf');
  if (ufItems.length === 0) return null;
  const total = ufItems.reduce((sum, a) => sum + Number(a.s.ts), 0);
  const counted = ufItems.reduce((sum, a) => sum + Number(a.s.st), 0);
  return { total, counted, percent: total > 0 ? (counted / total) * 100 : 0 };
}

export interface Electorado {
  total: number;
  accountedFor: number;
}

/**
 * Como `findAccompanimentSections`, mas devolve o eleitorado (`e`) da
 * entrada em vez das seções (`s`) — usado só para "eleito matematicamente"
 * (ver `electionMath.ts`). Devolve `null` quando a entrada não existe ou não
 * tem o campo `e` (nunca inventa um número).
 */
export function findElectorado(payload: Ea14Payload, uf: string | null): Electorado | null {
  const item = uf
    ? payload.abr.find((a) => a.tpabr === 'uf' && a.cdabr === uf.toLowerCase())
    : payload.abr.find((a) => a.tpabr === 'br');
  if (!item?.e) return null;
  return { total: Number(item.e.te), accountedFor: Number(item.e.c) + Number(item.e.a) };
}

/** Mescla seções totalizadas e eleitorado (quando disponíveis) num `ElectionResults` já existente. */
function mergeAccompaniment(data: ElectionResults, payload: Ea14Payload, uf: string | null): ElectionResults {
  const sections = findAccompanimentSections(payload, uf);
  const electorado = findElectorado(payload, uf);
  return {
    ...data,
    ...(sections
      ? { sectionsTotal: sections.total, sectionsCounted: sections.counted, sectionsPercent: sections.percent }
      : {}),
    ...(electorado ? { electorateTotal: electorado.total, electorateAccountedFor: electorado.accountedFor } : {}),
  };
}

interface ResultCacheRecord {
  status: ProviderStatus;
  data: ElectionResults | null;
  fetchedAt: number | null;
  fetching: boolean;
  lastAttemptAt: number | null;
}

interface CatalogState {
  status: ProviderStatus;
  catalog: Ea11Catalog | null;
  /** true enquanto uma requisição está em voo — evita re-disparar a cada chamada. */
  fetching: boolean;
  lastAttemptAt: number | null;
}

interface AccompanimentState {
  status: ProviderStatus;
  payload: Ea14Payload | null;
  fetching: boolean;
  lastAttemptAt: number | null;
}

/**
 * Intervalo mínimo entre tentativas de rebuscar o catálogo (ou um arquivo de
 * resultado) depois de uma tentativa anterior. Sem isso, cada chamada de
 * `getResults` (potencialmente uma por renderização) tentaria de novo
 * imediatamente — o que além de martelar o servidor do TSE, também torna
 * qualquer status que não seja "loading" praticamente inobservável pelo
 * chamador (a nova tentativa já teria começado antes de ele conseguir ler o
 * status).
 */
const RETRY_COOLDOWN_MS = 5000;

export function createTseDataProvider(
  getEnv: () => TseEnvKey,
  queue: RequestQueue = new RequestQueue(),
  /**
   * Chamado sempre que uma busca em segundo plano termina (catálogo ou
   * resultado), depois do novo `status`/dado já estar salvo. Sem isso, a UI
   * só refletiria uma busca concluída na próxima vez que algo mais disparasse
   * uma nova renderização (ex.: abrir Configurações) — os dados chegariam
   * "certinho" internamente, mas a tela ficaria parada na última renderização
   * até uma ação não relacionada acontecer.
   */
  onUpdate?: () => void,
): DataProvider {
  const resultsCache = new Map<string, ResultCacheRecord>();
  const catalogState: CatalogState = { status: 'unconfigured', catalog: null, fetching: false, lastAttemptAt: null };
  let catalogEnv: TseEnvKey | null = null;
  /**
   * Cache do arquivo de acompanhamento (EA14) por `cdEleicao` — não por
   * cargo/UF, já que um único arquivo Brasil-scoped cobre todas as UFs
   * daquela eleição (ex.: Governador/Senador/Dep. Federal/Dep. Estadual
   * compartilham a mesma eleição estadual, logo o mesmo arquivo).
   */
  const accompanimentCache = new Map<number, AccompanimentState>();

  function keyFor(office: OfficeKey, uf: string | null, turn: Turn): string {
    return `${office}|${uf ?? 'BR'}|${turn}`;
  }

  function currentEntry(key: string): ResultCacheRecord {
    const existing = resultsCache.get(key);
    if (existing) return existing;
    const fresh: ResultCacheRecord = {
      status: 'unconfigured',
      data: null,
      fetchedAt: null,
      fetching: false,
      lastAttemptAt: null,
    };
    resultsCache.set(key, fresh);
    return fresh;
  }

  /** Busca o texto de uma URL e devolve o payload já verificado (JWS válido, alg EdDSA, kid do ambiente). */
  async function fetchVerified(
    env: TseEnvKey,
    url: string,
  ): Promise<{ notFound: true } | { notFound: false; payload: unknown }> {
    const res = await queue.fetchText(url);
    if (res.notFound || res.body === null) return { notFound: true };
    const { kid, rawPublicKey } = getTseVerificationKey(env);
    const decoded = await verifyJws(res.body, rawPublicKey, { allowedAlgs: ['EdDSA'], expectedKid: kid });
    return { notFound: false, payload: decoded.payload };
  }

  /**
   * Busca e faz o parsing do catálogo EA11, em segundo plano, com cache.
   * `status` só muda quando uma requisição efetivamente termina (sucesso ou
   * falha) — uma requisição em voo é sinalizada por `fetching`, nunca
   * sobrescrevendo `status` no meio do caminho, para que o chamador sempre
   * veja o último estado conhecido em vez de uma corrida entre "loading" e o
   * resultado real.
   */
  function ensureCatalog(): CatalogState {
    const env = getEnv();
    if (catalogEnv !== env) {
      // Ambiente trocado (oficial/simulado): descarta o catálogo anterior.
      catalogState.status = 'unconfigured';
      catalogState.catalog = null;
      catalogState.fetching = false;
      catalogState.lastAttemptAt = null;
      catalogEnv = env;
    }
    if (catalogState.catalog || catalogState.fetching) return catalogState;
    if (catalogState.lastAttemptAt !== null && Date.now() - catalogState.lastAttemptAt < RETRY_COOLDOWN_MS) {
      return catalogState;
    }

    catalogState.fetching = true;
    catalogState.lastAttemptAt = Date.now();
    const url = TSE_CONFIG.ea11Url(env);
    fetchVerified(env, url)
      .then((res) => {
        catalogState.fetching = false;
        if (res.notFound) {
          catalogState.status = 'error';
          return;
        }
        try {
          catalogState.catalog = parseEa11Catalog(res.payload);
          catalogState.status = 'ready';
        } catch {
          catalogState.status = 'error';
        }
      })
      .catch(() => {
        catalogState.fetching = false;
        // Assinatura inválida (JwsVerificationError) ou erro de rede: nunca
        // promover um catálogo não verificado — mesmo que já tenhamos um
        // catálogo válido em cache, este mantém-se (não apagamos catalog aqui).
        catalogState.status = 'error';
      })
      .finally(() => onUpdate?.());
    return catalogState;
  }

  /**
   * Busca e faz o parsing do arquivo de acompanhamento (EA14) de uma eleição,
   * em segundo plano, com cache por `cdEleicao`. Mesmo padrão de `ensureCatalog`
   * (nunca repete uma busca em voo, respeita o cooldown, nunca descarta o
   * último payload válido por causa de uma tentativa nova que falhou).
   */
  function ensureAccompaniment(
    env: TseEnvKey,
    catalog: Ea11Catalog,
    ciclo: string,
    cdEleicao: number,
  ): AccompanimentState {
    const existing = accompanimentCache.get(cdEleicao);
    const state: AccompanimentState = existing ?? {
      status: 'unconfigured',
      payload: null,
      fetching: false,
      lastAttemptAt: null,
    };
    if (!existing) accompanimentCache.set(cdEleicao, state);

    // Diferente do catálogo (EA11, estático pro ciclo inteiro), o
    // acompanhamento muda o dia inteiro — é literalmente o progresso da
    // totalização. Um `state.payload ||` aqui (como o catálogo tem) travaria
    // "seções totalizadas" no valor da primeira busca pra sempre, divergindo
    // cada vez mais do site oficial conforme a apuração avança (confirmado:
    // era exatamente esse o bug reportado, mesmo depois da fórmula do
    // percentual estar correta). Resultado (EA20) já segue este padrão —
    // nunca para de tentar, só respeita o cooldown entre tentativas.
    if (state.fetching) return state;
    if (state.lastAttemptAt !== null && Date.now() - state.lastAttemptAt < RETRY_COOLDOWN_MS) return state;

    const url = TSE_CONFIG.buildAccompanimentPath(env, catalog, { uf: null, ciclo, cdEleicao });
    if (!url) {
      // O catálogo não lista um template para o tipo "ab" — nunca inventar o
      // restante do caminho; "seções totalizadas" fica indisponível ("—").
      state.status = 'unconfigured';
      return state;
    }

    state.fetching = true;
    state.lastAttemptAt = Date.now();
    fetchVerified(env, url)
      .then((res) => {
        state.fetching = false;
        if (res.notFound) {
          state.status = 'error';
          return;
        }
        try {
          state.payload = parseEa14Payload(res.payload);
          state.status = 'ready';
        } catch {
          state.status = 'error';
        }
      })
      .catch(() => {
        state.fetching = false;
        state.status = 'error';
      })
      .finally(() => onUpdate?.());
    return state;
  }

  /**
   * Dispara (sem aguardar) uma tentativa de atualização em segundo plano.
   * Nunca apaga o último resultado válido em cache apenas porque a tentativa
   * mais nova falhou.
   */
  function refreshInBackground(office: OfficeKey, uf: string | null, turn: Turn): void {
    const env = getEnv();
    const key = keyFor(office, uf, turn);
    const entry = currentEntry(key);
    const catalog = ensureCatalog();

    if (!catalog.catalog) {
      if (!entry.data) {
        entry.status = catalog.fetching ? 'loading' : catalog.status === 'error' ? 'error' : 'unconfigured';
      }
      return;
    }

    const resolved = resolveElection(catalog.catalog, office, turn);
    if (!resolved) {
      if (!entry.data) entry.status = 'unconfigured';
      return;
    }

    const cdEleicao = turn === 2 && resolved.cdEleicaoTurno2 ? resolved.cdEleicaoTurno2 : resolved.cdEleicao;

    // Busca (com cache por cdEleicao, não por cargo/UF) o arquivo de
    // acompanhamento — nunca bloqueia o resultado principal: se ainda não
    // chegou, "seções totalizadas" fica "—" até a próxima renderização.
    const accompaniment = ensureAccompaniment(env, catalog.catalog, resolved.ciclo, cdEleicao);
    if (entry.data && accompaniment.payload) {
      entry.data = mergeAccompaniment(entry.data, accompaniment.payload, uf);
    }

    const url = TSE_CONFIG.buildResultPath('EA20', env, catalog.catalog, {
      office,
      uf,
      ciclo: resolved.ciclo,
      cdEleicao,
    });
    if (!url) {
      // O catálogo não lista um template de diretório para o tipo "u" — nunca
      // inventar o restante do caminho.
      if (!entry.data) entry.status = 'unconfigured';
      return;
    }

    if (entry.fetching) return;
    if (entry.lastAttemptAt !== null && Date.now() - entry.lastAttemptAt < RETRY_COOLDOWN_MS) return;

    entry.fetching = true;
    entry.lastAttemptAt = Date.now();
    if (!entry.data) entry.status = 'loading';
    fetchVerified(env, url)
      .then((res) => {
        entry.fetching = false;
        if (res.notFound) {
          if (!entry.data) entry.status = 'error';
          return;
        }
        try {
          entry.data = parseEa20Payload(res.payload as Ea20Payload, office, uf ?? 'BR');
          if (accompaniment.payload) {
            entry.data = mergeAccompaniment(entry.data, accompaniment.payload, uf);
          }
          entry.status = 'ready';
          entry.fetchedAt = Date.now();
        } catch {
          if (!entry.data) entry.status = 'error';
        }
      })
      .catch(() => {
        entry.fetching = false;
        // Assinatura inválida ou erro de rede: preserva o último dado válido
        // (se houver) e nunca promove o novo corpo a "ready".
        if (!entry.data) entry.status = 'error';
      })
      .finally(() => onUpdate?.());
  }

  return {
    getElectionData(): ElectionDataStatus {
      return { status: ensureCatalog().status };
    },
    getResults(office: OfficeKey, uf: string | null, turn: Turn): ProviderResult {
      const key = keyFor(office, uf, turn);
      refreshInBackground(office, uf, turn);
      const entry = currentEntry(key);
      return { status: entry.status, data: entry.data, fetchedAt: entry.fetchedAt };
    },
    getCandidates(office: OfficeKey, uf: string | null, turn: Turn): ProviderResult {
      return this.getResults(office, uf, turn);
    },
    getLastUpdate(): number | null {
      for (const entry of resultsCache.values()) {
        if (entry.fetchedAt) return entry.fetchedAt;
      }
      return null;
    },
  };
}
