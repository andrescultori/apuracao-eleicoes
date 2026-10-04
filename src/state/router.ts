import { OFFICES, UF_MAP } from '../data/domain';
import type { OfficeKey, PageKey } from '../data/types';
import type { AppState } from './store';

/**
 * Roteamento por URL (ex.: `/governador/sp`, `/presidente/pr`) — mapeia
 * `AppState.page`/`uf`/`nationalUfFilter` de/para `location.pathname`, para
 * que a página dê pra compartilhar/recarregar sem perder o cargo/UF atual.
 *
 * Fora de escopo de propósito: turno (1º/2º) não entra na URL — é um alterna
 * de visualização, não "qual página", e manter o esquema de rotas simples
 * pesou mais que cobrir esse caso.
 *
 * Caminhos sempre relativos à raiz do app (sem o prefixo de base do deploy,
 * ex.: `/apuracao-eleicoes/` nas Páginas do GitHub) — `toHref`/`currentRoute`
 * cuidam de acrescentar/remover esse prefixo via `import.meta.env.BASE_URL`.
 */

const OFFICE_SLUGS: Record<OfficeKey, string> = {
  presidente: 'presidente',
  governador: 'governador',
  senador: 'senador',
  deputadoFederal: 'deputado-federal',
  deputadoEstadual: 'deputado-estadual',
};

const SLUG_TO_OFFICE: Record<string, OfficeKey> = Object.fromEntries(
  (Object.entries(OFFICE_SLUGS) as [OfficeKey, string][]).map(([office, slug]) => [slug, office]),
);

function isOfficeKey(page: PageKey): page is OfficeKey {
  return page in OFFICE_SLUGS;
}

export interface ParsedRoute {
  page: PageKey;
  /** UF do caminho (minúsculo na URL, aqui já em maiúsculo) — `null` quando a rota não tem UF. */
  uf: string | null;
}

/** Rota correspondente ao estado atual — fonte única tanto do caminho (`pathForRoute`) quanto do objeto salvo em cada `pushState` (ver `events.ts`). */
export function routeForState(state: AppState): ParsedRoute {
  if (!isOfficeKey(state.page)) return { page: state.page, uf: null };
  const uf = OFFICES[state.page].scope === 'national' ? state.nationalUfFilter : state.uf;
  return { page: state.page, uf };
}

/** Caminho (sem a base do deploy) correspondente a uma rota — sempre começa com "/". */
export function pathForRoute(route: ParsedRoute): string {
  if (route.page === 'overview') return '/';
  if (route.page === 'favorites') return '/favoritos';
  if (route.page === 'about') return '/sobre';
  if (!isOfficeKey(route.page)) return '/';
  const slug = OFFICE_SLUGS[route.page];
  return route.uf ? `/${slug}/${route.uf.toLowerCase()}` : `/${slug}`;
}

/**
 * Lê um caminho (sem a base do deploy) e devolve a rota correspondente, ou
 * `null` quando não casa com nenhuma rota conhecida — nesse caso o chamador
 * nunca força um estado inválido, só mantém o que já tinha (padrão ou
 * persistido).
 */
export function parsePath(pathname: string): ParsedRoute | null {
  const segments = pathname.split('/').filter(Boolean);
  // A raiz pura ("/", sem segmento nenhum) não é tratada como "rota pra
  // Visão geral" — é tratada como "nenhuma rota na URL", pra não forçar quem
  // só visita o domínio de volta pra Visão geral sempre, perdendo a última
  // página visitada (persistida em localStorage, ver store.ts). Navegar
  // explicitamente pra Visão geral (clicando no menu) ainda muda a URL pra
  // "/" normalmente — `pathForRoute` cobre isso; só a LEITURA da raiz pura
  // não é tratada como uma escolha explícita de página.
  if (segments.length === 0) return null;
  if (segments.length === 1 && segments[0] === 'favoritos') return { page: 'favorites', uf: null };
  if (segments.length === 1 && segments[0] === 'sobre') return { page: 'about', uf: null };

  const office = SLUG_TO_OFFICE[segments[0]!];
  if (!office || segments.length > 2) return null;

  if (segments.length === 1) return { page: office, uf: null };
  const uf = segments[1]!.toUpperCase();
  if (!UF_MAP[uf]) return null;
  return { page: office, uf };
}

/** Base do deploy (ex.: "/" no Vercel, "/apuracao-eleicoes/" nas Páginas do GitHub) — sempre termina com "/". */
function deployBase(): string {
  return import.meta.env.BASE_URL;
}

/** Monta a URL completa (com a base do deploy) para um caminho relativo (ex.: "/governador/sp"). */
export function toHref(path: string): string {
  const base = deployBase();
  return base.slice(0, -1) + path;
}

/** Lê `window.location` e devolve a rota atual (já sem a base do deploy), ou `null` se não casar com nenhuma rota conhecida. */
export function currentRoute(): ParsedRoute | null {
  const base = deployBase();
  const pathname = window.location.pathname;
  if (!pathname.startsWith(base.slice(0, -1))) return null;
  // Remove o prefixo de base, mantendo a barra inicial (base sempre termina com "/").
  const relative = pathname.slice(base.length - 1) || '/';
  return parsePath(relative);
}

/** Aplica uma rota já resolvida (ver `currentRoute`/`parsePath`) a um `AppState`, sem mexer no que a rota não cobre (turno, busca, etc.). */
export function applyRoute(state: AppState, route: ParsedRoute): void {
  state.page = route.page;
  if (!isOfficeKey(route.page)) return;
  if (OFFICES[route.page].scope === 'national') {
    state.nationalUfFilter = route.uf;
  } else if (route.uf) {
    state.uf = route.uf;
  }
}
