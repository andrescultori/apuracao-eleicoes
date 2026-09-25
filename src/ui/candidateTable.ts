import type { CandidateResult, ElectionResults, OfficeKey, Turn } from '../data/types';
import type { AppContext } from '../state/appContext';
import { esc, fmtInt, fmtPct } from '../util';

export function renderDeltaVotes(cur: CandidateResult, prev: CandidateResult | undefined): string {
  if (!prev) return '<span class="delta flat">— sem histórico</span>';
  const d = cur.votes - prev.votes;
  if (d === 0) return '<span class="delta flat">— sem alteração</span>';
  return `<span class="delta up">+${fmtInt(d)} votos</span>`;
}

export function renderDeltaPos(cur: CandidateResult, prev: CandidateResult | undefined): string {
  if (!prev) return '';
  const d = prev.position - cur.position;
  if (d > 0) return `<span class="delta up">▲ ${d}</span>`;
  if (d < 0) return `<span class="delta down">▼ ${Math.abs(d)}</span>`;
  return '<span class="delta flat">— </span>';
}

export function CandidateTable(
  app: AppContext,
  office: OfficeKey,
  turn: Turn,
  uf: string | null,
  results: ElectionResults,
  prevById: Record<string, CandidateResult>,
): string {
  const q = app.state.search.trim().toLowerCase();
  const rows = results.candidates.filter((c) => {
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.ballotName.toLowerCase().includes(q) ||
      c.number.includes(q) ||
      c.party.toLowerCase().includes(q)
    );
  });

  if (!results.candidates.length) {
    return '<div class="table-card"><div class="empty-note">Nenhum dado disponível para esta seleção.</div></div>';
  }
  if (!rows.length) {
    return `<div class="table-card"><div class="empty-note">Nenhum candidato encontrado para "${esc(app.state.search)}".</div></div>`;
  }

  const trs = rows
    .map((c) => {
      const prev = prevById[c.id];
      const fav = app.isFav(turn, office, uf, c.id);
      return (
        `<tr class="${fav ? 'is-fav' : ''}">` +
        '<td data-label="Pos.">' +
        `<div class="pos-cell"><span class="num">${c.position}º</span>${renderDeltaPos(c, prev)}</div>` +
        '</td>' +
        '<td class="cand-cell" data-label="Candidato">' +
        `<button class="star-btn ${fav ? 'active' : ''}" data-action="toggle-fav" data-office="${office}" data-uf="${uf ?? ''}" data-turn="${turn}" data-id="${c.id}" aria-label="${fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}: ${esc(c.name)}" aria-pressed="${fav}">${fav ? '★' : '☆'}</button>` +
        `<span class="cand-name">${esc(c.name)}</span>` +
        '</td>' +
        `<td data-label="Nº" class="num">${esc(c.number)}</td>` +
        `<td data-label="Partido"><span class="party-chip">${esc(c.party)}</span></td>` +
        `<td class="td-num" data-label="Votos"><div class="num">${fmtInt(c.votes)}</div>${renderDeltaVotes(c, prev)}</td>` +
        `<td class="td-num" data-label="%"><span class="num">${fmtPct(c.percentage)}%</span></td>` +
        '</tr>'
      );
    })
    .join('');

  return (
    '<div class="table-card"><div class="table-scroll">' +
    '<table class="results">' +
    '<thead><tr>' +
    '<th style="width:70px;">Pos.</th><th>Candidato</th><th class="th-num">Nº</th><th>Partido</th>' +
    '<th class="th-num">Votos</th><th class="th-num">%</th>' +
    '</tr></thead>' +
    `<tbody>${trs}</tbody>` +
    '</table>' +
    '</div></div>'
  );
}
