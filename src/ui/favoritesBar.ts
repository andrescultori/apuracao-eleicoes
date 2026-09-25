import { OFFICES } from '../data/domain';
import type { AppContext } from '../state/appContext';
import { resolveFavoriteKey } from '../state/appContext';
import { esc, fmtPct } from '../util';
import { ICONS } from './icons';

const STAR_SM = ICONS.star.replace('<svg ', '<svg style="width:11px;height:11px;color:var(--favorite);" ');

/**
 * Barra de candidatos favoritos, exibida no topo de toda página (acima do
 * menu "Visão geral"), com a posição/percentual atual de cada um. Some
 * quando não há favoritos. Clicar em um chip leva direto à corrida dele,
 * ajustando turno e UF conforme o favorito.
 */
export function FavoritesBar(app: AppContext): string {
  if (!app.state.favorites.length) return '';

  const chips = app.state.favorites
    .map((key) => resolveFavoriteKey(app, key))
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .map((r) => {
      const cfg = OFFICES[r.office];
      const scopeLabel = r.uf ?? 'BR';
      return (
        `<button class="fav-chip" data-action="go" data-page="${r.office}" data-uf="${r.uf ?? ''}" data-turn="${r.turn}" ` +
        `title="${esc(cfg.label)}${r.uf ? ' · ' + r.uf : ''} · ${r.turn}º turno">` +
        `${STAR_SM}<span class="fav-chip-name">${esc(r.candidate.name)}</span>` +
        `<span class="fav-chip-meta">${esc(cfg.short)} · ${esc(scopeLabel)}</span>` +
        `<span class="fav-chip-pct num">${fmtPct(r.candidate.percentage)}%</span>` +
        '</button>'
      );
    })
    .join('');

  if (!chips) return '';

  return `<div class="fav-bar-wrap"><div class="shell fav-bar"><span class="fav-bar-label">⭐ Favoritos</span>${chips}</div></div>`;
}
