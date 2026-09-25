import { parseEa11Catalog, resolveElection, type Ea11Catalog } from './ea11';
import { RequestQueue } from './requestQueue';
import { padCode, TSE_CONFIG, type TseEnvKey } from './tseConfig';
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
 * eleições (EA11), e resolve dinamicamente o código de eleição/ciclo de cada
 * cargo e UF a partir dele (nunca por um código fixo — ver ea11.ts).
 *
 * O que ainda NÃO é possível concluir, e por isso `getResults`/`getCandidates`
 * devolvem honestamente "unconfigured": construir a URL do arquivo de
 * resultado (EA10/EA20) também exige o código de cargo do TSE por OfficeKey,
 * que não pôde ser confirmado na documentação disponível nesta sessão (ver
 * `TSE_CONFIG.officeCargoCode` em tseConfig.ts). Assim que esse código for
 * confirmado e preenchido lá, este provedor passa a buscar e (após a
 * verificação de integridade — ver jws.ts) exibir os resultados reais, sem
 * precisar de nenhuma outra mudança estrutural aqui.
 */

/**
 * Formato do payload esperado do arquivo EA20 (resultado unificado), com os
 * nomes de campo reconstruídos e validados contra amostras reais de JSON do
 * TSE (simulado 2026 e oficial 2024) — ver nota de fontes em tseConfig.ts.
 * Ainda assim, não é uma transcrição literal da especificação oficial em PDF
 * (não localizada para o EA20 nesta sessão), por isso o tipo é tratado como
 * best-effort e revisado assim que a especificação puder ser confirmada.
 */
export interface Ea20Candidato {
  n: string; // número de urna
  sqcand: number;
  nm: string;
  nmu: string; // nome de urna
  vap: number; // votos
  pvapn: number; // percentual de votos (decimal)
}

export interface Ea20Partido {
  n: number;
  sg: string;
  nm: string;
  cand: Ea20Candidato[];
}

export interface Ea20Agrupamento {
  n: number;
  nm: string;
  tp: 'i' | 'f' | 'c';
  par: Ea20Partido[];
}

export interface Ea20Cargo {
  cd: string;
  v: { tv: number; vv: number };
  agr: Ea20Agrupamento[];
}

export interface Ea20Payload {
  ele: number;
  t: Turn;
  dg: string;
  hg: string;
  idg?: number;
  carg: Ea20Cargo[];
}

/**
 * Converte o payload (já verificado) do EA20 para o modelo interno da
 * aplicação. Função pura, testável com fixtures.
 */
export function parseEa20Payload(payload: Ea20Payload, office: OfficeKey, state: string): ElectionResults {
  const cargo = payload.carg[0];
  if (!cargo) return { candidates: [], totalValid: 0, totalApurados: 0 };

  const candidates: CandidateResult[] = [];
  for (const agr of cargo.agr) {
    for (const par of agr.par) {
      for (const c of par.cand) {
        candidates.push({
          id: String(c.sqcand),
          name: c.nm,
          ballotName: c.nmu,
          number: c.n,
          party: par.sg,
          state,
          office,
          finalShare: 0,
          votes: c.vap,
          percentage: c.pvapn,
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
    totalValid: cargo.v.vv,
    totalApurados: cargo.v.tv,
  };
}

interface ResultCacheRecord {
  status: ProviderStatus;
  data: ElectionResults | null;
  fetchedAt: number | null;
  fetching: boolean;
}

interface CatalogState {
  status: ProviderStatus;
  catalog: Ea11Catalog | null;
  /** true enquanto uma requisição está em voo — evita re-disparar a cada chamada. */
  fetching: boolean;
  lastAttemptAt: number | null;
}

/**
 * Intervalo mínimo entre tentativas de rebuscar o catálogo depois de uma
 * falha. Sem isso, cada chamada de `getResults` (potencialmente uma por
 * renderização) tentaria de novo imediatamente — o que além de martelar o
 * servidor do TSE, também torna o estado "error" praticamente inobservável
 * pelo chamador (a nova tentativa já teria começado antes de ele conseguir
 * ler o status).
 */
const CATALOG_RETRY_COOLDOWN_MS = 5000;

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
    const fresh: ResultCacheRecord = { status: 'unconfigured', data: null, fetchedAt: null, fetching: false };
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
    if (catalogState.lastAttemptAt !== null && Date.now() - catalogState.lastAttemptAt < CATALOG_RETRY_COOLDOWN_MS) {
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
    const url = TSE_CONFIG.buildResultPath('EA20', getEnv(), {
      office,
      uf,
      ciclo: resolved.ciclo,
      cdEleicaoPadded: padCode(cdEleicao, 6),
    });
    if (!url) {
      // Código de cargo do TSE ainda não confirmado (ver TSE_CONFIG.officeCargoCode) —
      // o caminho não pode ser construído com segurança. Nunca adivinhar.
      if (!entry.data) entry.status = 'unconfigured';
      return;
    }

    if (entry.fetching) return;
    entry.fetching = true;
    if (!entry.data) entry.status = 'loading';
    queue
      .fetchJson(url)
      .then((res) => {
        entry.fetching = false;
        if (res.notFound) {
          if (!entry.data) entry.status = 'error';
          return;
        }
        // TODO(tse-integracao): antes de aceitar `res.body` como válido, verificar a
        // integridade do arquivo (ver jws.ts e a nota sobre o mecanismo de assinatura,
        // ainda não confirmado, no topo de tseConfig.ts). Sem essa confirmação, os
        // dados nunca devem ser promovidos a "ready" — por isso o status permanece
        // inalterado aqui até essa etapa ser implementada com uma chave/certificado
        // real.
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
