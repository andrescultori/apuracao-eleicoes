import { SENADO_SEATS_2026 } from '../data/domain';
import type { CandidateResult, ElectionResults, OfficeKey, Turn } from '../data/types';
import type { AppContext } from '../state/appContext';
import { esc, fmtInt, fmtPct } from '../util';

/** Quantas vagas totais mostrar em "N de M vagas" — só Senado tem mais de uma (ver `SENADO_SEATS_2026` em domain.ts). */
function totalSeats(office: OfficeKey): number {
  return office === 'senador' ? SENADO_SEATS_2026 : 1;
}

function candidateCard(app: AppContext, office: OfficeKey, turn: Turn, uf: string | null, c: CandidateResult): string {
  const fav = app.isFav(turn, office, uf, c.id);
  return (
    '<div class="elected-card">' +
    `<button class="star-btn ${fav ? 'active' : ''}" data-action="toggle-fav" data-office="${office}" data-uf="${uf ?? ''}" data-turn="${turn}" data-id="${c.id}" aria-label="${fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}: ${esc(c.ballotName)}" aria-pressed="${fav}">${fav ? '★' : '☆'}</button>` +
    `<div class="elected-card-name" title="${esc(c.name)}">${esc(c.ballotName)}</div>` +
    `<div class="elected-card-meta"><span class="party-chip">${esc(c.party)}</span> ${esc(c.number)}</div>` +
    `<div class="elected-card-stats num">${fmtInt(c.votes)} votos · ${fmtPct(c.percentage)}%</div>` +
    '</div>'
  );
}

/**
 * Seção dedicada de "Eleitos" — Presidente, Governador e Senador (ver
 * `applyElectionCertainty` em appContext.ts sobre por que Deputado
 * Federal/Estadual ficam de fora: falta o número de vagas por UF,
 * confirmado em nenhuma fonte do TSE).
 */
export function ElectedSection(
  app: AppContext,
  office: OfficeKey,
  turn: Turn,
  uf: string | null,
  results: ElectionResults,
): string {
  if (office === 'deputadoFederal' || office === 'deputadoEstadual') return '';
  const elected = results.candidates.filter((c) => c.elected);
  if (!elected.length) return '';

  const seats = totalSeats(office);
  const cards = elected.map((c) => candidateCard(app, office, turn, uf, c)).join('');
  // Pra Presidente/Governador (1 vaga só), "1 de 1 vaga" soa estranho — o
  // resultado em si já é a frase, sem a moldura "N de M vagas" que só faz
  // sentido pro Senado (2 vagas em disputa por UF).
  const subtitle =
    seats > 1
      ? `${elected.length} de ${seats} vagas decididas matematicamente (não oficial)`
      : 'Resultado decidido matematicamente (não oficial)';

  return (
    '<div class="elected-section">' +
    '<div class="section-head"><h2>🏅 Eleitos</h2>' +
    `<span class="muted">${subtitle}</span></div>` +
    `<div class="elected-grid">${cards}</div>` +
    '</div>'
  );
}

/**
 * Seção "Confirmados para o 2º turno" — só no 1º turno de Presidente e
 * Governador, enquanto a corrida ainda não se decidiu de vez (ninguém com
 * maioria absoluta garantida — ver `confirmedRunoff` em appContext.ts). Usa
 * o mesmo card visual de `ElectedSection`, só com a cor de destaque (azul em
 * vez de verde) pra não confundir com "já eleito": avançar pro 2º turno não
 * é vencer a eleição.
 */
export function RunoffSection(
  app: AppContext,
  office: OfficeKey,
  turn: Turn,
  uf: string | null,
  results: ElectionResults,
): string {
  if (turn !== 1 || (office !== 'presidente' && office !== 'governador')) return '';
  const confirmed = results.candidates.filter((c) => c.confirmedRunoff);
  if (!confirmed.length) return '';

  const cards = confirmed.map((c) => candidateCard(app, office, turn, uf, c)).join('');

  return (
    '<div class="elected-section runoff">' +
    '<div class="section-head"><h2>🗳️ Confirmados para o 2º turno</h2>' +
    `<span class="muted">${confirmed.length} de 2 vagas garantidas matematicamente (não oficial)</span></div>` +
    `<div class="elected-grid">${cards}</div>` +
    '</div>'
  );
}
