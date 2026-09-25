import { OFFICE_ORDER, OFFICES } from '../data/domain';
import type { ElectionResults, OfficeKey, Turn } from '../data/types';
import type { AppContext } from '../state/appContext';
import { esc, fmtInt, fmtPct } from '../util';
import { ICONS } from './icons';

const STAR_SM = ICONS.star.replace('<svg ', '<svg style="width:13px;height:13px;color:var(--favorite);" ');

export function FavoritesSection(
  app: AppContext,
  office: OfficeKey,
  turn: Turn,
  uf: string | null,
  results: ElectionResults,
): string {
  const favInScope = results.candidates.filter((c) => app.isFav(turn, office, uf, c.id));
  if (!favInScope.length) return '';
  const cards = favInScope
    .map(
      (c) =>
        '<div class="fav-card">' +
        `<div class="fav-name">${STAR_SM} ${esc(c.name)}</div>` +
        `<div class="fav-meta">${OFFICES[office].label}${OFFICES[office].scope !== 'national' ? ' · ' + uf : ''} · ${esc(c.party)} ${esc(c.number)}</div>` +
        `<div class="fav-stats num">${fmtInt(c.votes)} votos · ${fmtPct(c.percentage)}% · ${c.position}º lugar</div>` +
        `<button class="fav-remove" data-action="unfav" data-office="${office}" data-uf="${uf ?? ''}" data-turn="${turn}" data-id="${c.id}">Remover dos favoritos</button>` +
        '</div>',
    )
    .join('');
  return (
    `<div><div class="section-head"><h2>⭐ Meus candidatos</h2><span class="muted">${favInScope.length} nesta corrida</span></div>` +
    `<div class="fav-grid">${cards}</div></div>`
  );
}

export function FavoritesPage(app: AppContext): string {
  if (!app.state.favorites.length) {
    return (
      '<div class="empty-state"><h3>Meus candidatos</h3>' +
      '<p>Você ainda não adicionou candidatos aos favoritos.</p>' +
      '<button class="btn primary" data-action="go" data-page="overview">Explorar candidatos</button></div>'
    );
  }
  const groups = OFFICE_ORDER.map((office) => {
    const cfg = OFFICES[office];
    const entries = app.state.favorites.filter((k) => k.split('|')[1] === office);
    if (!entries.length) return '';
    const cards = entries
      .map((k) => {
        const parts = k.split('|');
        const turn = Number(parts[0]) as Turn;
        const favUf = parts[2] === 'BR' ? null : (parts[2] ?? null);
        const id = parts[3]!;
        const res = app.getOfficeResults(office, favUf, turn);
        const cand = res.candidates.find((c) => c.id === id);
        if (!cand) return '';
        return (
          '<div class="fav-card">' +
          `<div class="fav-name">${STAR_SM} ${esc(cand.name)}</div>` +
          `<div class="fav-meta">${cfg.label}${favUf ? ' · ' + favUf : ''} · ${turn}º turno · ${esc(cand.party)} ${esc(cand.number)}</div>` +
          `<div class="fav-stats num">${fmtInt(cand.votes)} votos · ${fmtPct(cand.percentage)}% · ${cand.position}º lugar</div>` +
          `<button class="fav-remove" data-action="unfav-key" data-key="${esc(k)}">Remover dos favoritos</button>` +
          '</div>'
        );
      })
      .join('');
    return `<div><div class="section-head"><h2>${cfg.label}</h2></div><div class="fav-grid">${cards}</div></div>`;
  }).join('');
  return (
    '<div class="stack">' +
    `<div class="section-head"><h2>Meus candidatos</h2><span class="muted">${app.state.favorites.length} favoritos</span></div>` +
    groups +
    '</div>'
  );
}
