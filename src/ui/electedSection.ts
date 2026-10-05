import { SENADO_SEATS_2026 } from '../data/domain';
import type { ElectionResults, OfficeKey, Turn } from '../data/types';
import type { AppContext } from '../state/appContext';
import { esc, fmtInt, fmtPct } from '../util';

/**
 * Seção dedicada de "Eleitos", para corridas com mais de uma vaga — hoje só
 * Senador (2 vagas, ver `SENADO_SEATS_2026` em domain.ts e a nota em
 * `applyElectionCertainty` em appContext.ts sobre por que Deputado
 * Federal/Estadual ainda não entram aqui). Presidente/Governador (1 vaga
 * só) não precisam disso — o vencedor já aparece claro como 1º colocado na
 * tabela/gráfico, com o mesmo selo "Eleito matematicamente".
 */
export function ElectedSection(
  app: AppContext,
  office: OfficeKey,
  turn: Turn,
  uf: string | null,
  results: ElectionResults,
): string {
  if (office !== 'senador') return '';
  const elected = results.candidates.filter((c) => c.elected);
  if (!elected.length) return '';

  const cards = elected
    .map((c) => {
      const fav = app.isFav(turn, office, uf, c.id);
      return (
        '<div class="elected-card">' +
        `<button class="star-btn ${fav ? 'active' : ''}" data-action="toggle-fav" data-office="${office}" data-uf="${uf ?? ''}" data-turn="${turn}" data-id="${c.id}" aria-label="${fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}: ${esc(c.ballotName)}" aria-pressed="${fav}">${fav ? '★' : '☆'}</button>` +
        `<div class="elected-card-name" title="${esc(c.name)}">${esc(c.ballotName)}</div>` +
        `<div class="elected-card-meta"><span class="party-chip">${esc(c.party)}</span> ${esc(c.number)}</div>` +
        `<div class="elected-card-stats num">${fmtInt(c.votes)} votos · ${fmtPct(c.percentage)}%</div>` +
        '</div>'
      );
    })
    .join('');

  return (
    '<div class="elected-section">' +
    '<div class="section-head"><h2>🏅 Eleitos</h2>' +
    `<span class="muted">${elected.length} de ${SENADO_SEATS_2026} vagas decididas matematicamente (não oficial)</span></div>` +
    `<div class="elected-grid">${cards}</div>` +
    '</div>'
  );
}
