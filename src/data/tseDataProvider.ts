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
    const { kid, keyPromise } = getTseVerificationKey(env);
    const key = await keyPromise;
    const decoded = await verifyJws(res.body, key, { allowedAlgs: ['EdDSA'], expectedKid: kid });
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
