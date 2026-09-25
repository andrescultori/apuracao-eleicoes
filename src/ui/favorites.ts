import { OFFICE_ORDER, OFFICES } from '../data/domain';
import type { ElectionResults, OfficeKey, Turn } from '../data/types';
import type { AppContext } from '../state/appContext';
import { resolveFavoriteKey } from '../state/appContext';
import { searchAllCandidates } from '../state/candidateSearch';
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

/**
 * Painel de busca do módulo "Candidatos Favoritos": encontra um candidato por
 * nome ou número em qualquer cargo/UF (não só na corrida atualmente aberta) e
 * permite marcá-lo como favorito diretamente daqui.
 */
function FavoritesSearchPanel(app: AppContext): string {
  const turnSeg =
    '<div class="seg" role="group" aria-label="Turno da busca">' +
    `<button aria-pressed="${app.state.turn === 1}" data-action="set-turn" data-value="1">1º Turno</button>` +
    `<button aria-pressed="${app.state.turn === 2}" data-action="set-turn" data-value="2">2º Turno</button>` +
    '</div>';

  const hits = searchAllCandidates(app, app.state.search);
  const query = app.state.search.trim();

  let resultsHtml: string;
  if (!query) {
    resultsHtml = '<p class="muted" style="padding:4px 2px;">Digite um nome ou número para encontrar um candidato.</p>';
  } else if (!hits.length) {
    resultsHtml = `<p class="muted" style="padding:4px 2px;">Nenhum candidato encontrado para "${esc(query)}".</p>`;
  } else {
    const rows = hits
      .map(({ office, uf, candidate: c }) => {
        const fav = app.isFav(app.state.turn, office, uf, c.id);
        const cfg = OFFICES[office];
        return (
          '<div class="search-result-row">' +
          `<button class="star-btn ${fav ? 'active' : ''}" data-action="toggle-fav" data-office="${office}" data-uf="${uf ?? ''}" data-turn="${app.state.turn}" data-id="${c.id}" aria-label="${fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}: ${esc(c.name)}" aria-pressed="${fav}">${fav ? '★' : '☆'}</button>` +
          '<div class="search-result-info">' +
          `<div class="cand-name">${esc(c.name)}</div>` +
          `<div class="fav-meta">${cfg.label}${uf ? ' · ' + uf : ''} · <span class="party-chip">${esc(c.party)}</span> ${esc(c.number)}</div>` +
          '</div>' +
          '</div>'
        );
      })
      .join('');
    resultsHtml = `<div class="search-results">${rows}</div>`;
  }

  return (
    '<div class="table-card" style="padding:14px 15px;">' +
    '<div class="section-head" style="margin-bottom:10px;"><h2>Buscar candidato</h2>' +
    turnSeg +
    '</div>' +
    '<div class="search-wrap" style="margin-bottom:10px;">' +
    ICONS.search +
    `<input class="search-input" id="cand-search" type="text" placeholder="Nome ou número do candidato..." ` +
    `value="${esc(app.state.search)}" data-action="search" aria-label="Buscar candidato por nome ou número, em qualquer cargo e estado">` +
    '</div>' +
    resultsHtml +
    '</div>'
  );
}

export function FavoritesPage(app: AppContext): string {
  const searchPanel = FavoritesSearchPanel(app);

  if (!app.state.favorites.length) {
    return (
      '<div class="stack">' +
      searchPanel +
      '<div class="empty-state"><h3>Meus candidatos</h3>' +
      '<p>Você ainda não adicionou candidatos aos favoritos. Use a busca acima para encontrar e marcar um candidato.</p>' +
      '</div>' +
      '</div>'
    );
  }
  const groups = OFFICE_ORDER.map((office) => {
    const cfg = OFFICES[office];
    const entries = app.state.favorites.filter((k) => k.split('|')[1] === office);
    if (!entries.length) return '';
    const cards = entries
      .map((k) => {
        const resolved = resolveFavoriteKey(app, k);
        if (!resolved) return '';
        const { turn, uf: favUf, candidate: cand } = resolved;
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
    searchPanel +
    `<div class="section-head"><h2>Meus candidatos</h2><span class="muted">${app.state.favorites.length} favoritos</span></div>` +
    groups +
    '</div>'
  );
}
