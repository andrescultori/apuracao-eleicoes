/**
 * Fila de requisições HTTP com concorrência 1 (bem abaixo do limite de 100
 * requisições/segundo por IP documentado pelo TSE), cache em memória por URL
 * com suporte a ETag/Last-Modified, backoff exponencial em erro de rede, e a
 * regra de nunca repetir uma URL que respondeu 404 (respostas 404 repetidas
 * podem causar bloqueio temporário de IP, segundo a documentação oficial).
 */

export interface CacheEntry {
  etag: string | null;
  lastModified: string | null;
  body: unknown;
  notFound: boolean;
}

export interface FetchLike {
  (
    input: string,
    init?: { headers?: Record<string, string> },
  ): Promise<{
    ok: boolean;
    status: number;
    headers: { get(name: string): string | null };
    json(): Promise<unknown>;
  }>;
}

export interface RequestQueueOptions {
  fetchImpl?: FetchLike;
  /** Intervalo mínimo entre requisições, em ms. */
  intervalMs?: number;
  /** Número máximo de tentativas por URL em caso de erro de rede (não em 404). */
  maxRetries?: number;
  /** Atraso base do backoff exponencial, em ms. */
  backoffBaseMs?: number;
}

interface QueueJob {
  url: string;
  resolve: (value: CacheEntry) => void;
  reject: (reason: unknown) => void;
}

export class RequestQueue {
  private readonly fetchImpl: FetchLike;
  private readonly intervalMs: number;
  private readonly maxRetries: number;
  private readonly backoffBaseMs: number;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly queue: QueueJob[] = [];
  private busy = false;

  constructor(options: RequestQueueOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
    this.intervalMs = options.intervalMs ?? 50;
    this.maxRetries = options.maxRetries ?? 1;
    this.backoffBaseMs = options.backoffBaseMs ?? 500;
  }

  getCached(url: string): CacheEntry | undefined {
    return this.cache.get(url);
  }

  /**
   * Busca uma URL respeitando a fila serial. Nunca repete uma URL que já
   * respondeu 404 nesta sessão (devolve o registro em cache com `notFound:
   * true` em vez de tentar de novo). Em erro de rede, tenta `maxRetries` vezes
   * extras com backoff exponencial antes de rejeitar.
   */
  fetchJson(url: string): Promise<CacheEntry> {
    const cached = this.cache.get(url);
    if (cached?.notFound) return Promise.resolve(cached);

    return new Promise((resolve, reject) => {
      this.queue.push({ url, resolve, reject });
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.busy || this.queue.length === 0) return;
    this.busy = true;
    const job = this.queue.shift()!;
    this.runJob(job)
      .catch((err) => job.reject(err))
      .finally(() => {
        this.busy = false;
        setTimeout(() => this.processQueue(), this.intervalMs);
      });
  }

  private async runJob(job: QueueJob, attempt = 0): Promise<void> {
    const cached = this.cache.get(job.url);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (cached?.etag) headers['If-None-Match'] = cached.etag;
    if (cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified;

    try {
      const res = await this.fetchImpl(job.url, { headers });

      if (res.status === 404) {
        const entry: CacheEntry = { etag: null, lastModified: null, body: null, notFound: true };
        this.cache.set(job.url, entry);
        job.resolve(entry);
        return;
      }

      if (res.status === 304 && cached) {
        job.resolve(cached);
        return;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const body = await res.json();
      const entry: CacheEntry = {
        etag: res.headers.get('ETag'),
        lastModified: res.headers.get('Last-Modified'),
        body,
        notFound: false,
      };
      this.cache.set(job.url, entry);
      job.resolve(entry);
    } catch (err) {
      if (attempt < this.maxRetries) {
        const delay = this.backoffBaseMs * 2 ** attempt;
        await new Promise((r) => setTimeout(r, delay));
        return this.runJob(job, attempt + 1);
      }
      // Nunca apaga o último resultado válido em cache só porque uma
      // atualização falhou — o chamador decide o que fazer com o erro.
      job.reject(err);
    }
  }
}
