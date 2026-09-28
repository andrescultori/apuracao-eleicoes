import { parseEa11Catalog, resolveElection, type Ea11Catalog } from './ea11';
import { RequestQueue } from './requestQueue';
import { TSE_CONFIG, type TseEnvKey } from './tseConfig';
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
 * O que já funciona de ponta a ponta: busca e faz o parsing do catálogo de
 * eleições (EA11), resolve dinamicamente o código de eleição de cada cargo/UF
 * a partir dele (nunca por um código fixo — ver ea11.ts), e monta a URL real
 * do arquivo de resultado (EA20) com o código de cargo confirmado (ver
 * `TSE_CONFIG.officeCargoCode`).
 *
 * O que ainda NÃO é possível concluir, e por isso `getResults`/`getCandidates`
 * continuam devolvendo honestamente "unconfigured" mesmo depois de um fetch
 * bem-sucedido: falta a chave pública real do TSE para verificar a assinatura
 * EdDSA do arquivo `.jws` (ver a nota completa em jws.ts — o Apêndice A lido
 * do manual é só de desenvolvimento, "não válido para resultados oficiais").
 * Sem essa verificação, os dados nunca são promovidos a "ready".
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

export function createTseDataProvider(getEnv: () => TseEnvKey, queue: RequestQueue = new RequestQueue()): DataProvider {
  const resultsCache = new Map<string, ResultCacheRecord>();
  const catalogState: CatalogState = { status: 'unconfigured', catalog: null, fetching: false, lastAttemptAt: null };
  let catalogEnv: TseEnvKey | null = null;

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
    queue
      .fetchJson(url)
      .then((res) => {
        catalogState.fetching = false;
        if (res.notFound || res.body === null) {
          catalogState.status = 'error';
          return;
        }
        // TODO(tse-integracao): res.body aqui é o JWS compacto do ele-c (string),
        // não JSON já decodificado — falta decodificar e verificar a assinatura
        // (ver jws.ts) antes de confiar no catálogo. Sem a chave pública real do
        // TSE, isso ainda não está ligado; ver nota de fontes em jws.ts.
        try {
          catalogState.catalog = parseEa11Catalog(res.body);
          catalogState.status = 'ready';
        } catch {
          catalogState.status = 'error';
        }
      })
      .catch(() => {
        catalogState.fetching = false;
        catalogState.status = 'error';
      });
    return catalogState;
  }

  /**
   * Dispara (sem aguardar) uma tentativa de atualização em segundo plano.
   * Nunca apaga o último resultado válido em cache apenas porque a tentativa
   * mais nova falhou.
   */
  function refreshInBackground(office: OfficeKey, uf: string | null, turn: Turn): void {
    const key = keyFor(office, uf, turn);
    const entry = currentEntry(key);
    const catalog = ensureCatalog();

    if (!catalog.catalog) {
      if (!entry.data) {
        entry.status = catalog.fetching ? 'loading' : catalog.status === 'error' ? 'error' : 'unconfigured';
      }
      return;
    }

    const resolved = resolveElection(catalog.catalog, office, turn, uf);
    if (!resolved) {
      if (!entry.data) entry.status = 'unconfigured';
      return;
    }

    const cdEleicao = turn === 2 && resolved.cdEleicaoTurno2 ? resolved.cdEleicaoTurno2 : resolved.cdEleicao;
    const url = TSE_CONFIG.buildResultPath('EA20', getEnv(), { office, uf, cdEleicao });

    if (entry.fetching) return;
    if (entry.lastAttemptAt !== null && Date.now() - entry.lastAttemptAt < RETRY_COOLDOWN_MS) return;

    entry.fetching = true;
    entry.lastAttemptAt = Date.now();
    if (!entry.data) entry.status = 'loading';
    queue
      .fetchJson(url)
      .then((res) => {
        entry.fetching = false;
        if (res.notFound) {
          if (!entry.data) entry.status = 'error';
          return;
        }
        // res.body é o JWS compacto (string) do EA20 — confirmado ao vivo como
        // EdDSA (Ed25519), ver jws.ts. TODO(tse-integracao): falta a chave
        // pública real do TSE para chamar verifyJws() aqui; o Apêndice A lido
        // do manual é só de desenvolvimento ("não válido para resultados
        // oficiais"), e o apêndice de produção ainda não foi lido. Sem essa
        // verificação, o arquivo já obtido NUNCA deve ser promovido a "ready"
        // — fica "unconfigured" mesmo tendo sido buscado com sucesso.
        if (!entry.data) entry.status = 'unconfigured';
      })
      .catch(() => {
        entry.fetching = false;
        if (!entry.data) entry.status = 'error';
      });
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
