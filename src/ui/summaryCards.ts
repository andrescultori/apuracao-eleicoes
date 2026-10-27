import { partyFillColor } from '../data/partyColors';
import type { ElectionResults } from '../data/types';
import type { AppContext } from '../state/appContext';
import { timeAgoLabel } from '../state/appContext';
import { statusForT } from '../data/mockDataProvider';
import { clamp, esc, fmtInt, fmtPct } from '../util';
import { ICONS } from './icons';

/**
 * Barra única, dividida por candidato (cor de `partyFillColor`, mesma
 * aproximação visual usada no mapa e no card de confronto direto — nunca uma
 * cor oficial de partido), mostrando a distribuição parcial dos votos dentro
 * do card de apuração — até os 8 primeiros, mesmo corte usado em
 * `VoteChart`, pra não lotar uma barra fina de segmentos ilegíveis quando há
 * dezenas de candidatos (Dep. Federal/Estadual).
 */
function VoteShareBar(results: ElectionResults): string {
  if (!results.candidates.length) return '';
  const top = results.candidates
    .slice()
    .sort((a, b) => b.votes - a.votes)
    .slice(0, 8);
  const segs = top
    .map((c) => {
      const w = clamp(c.percentage, 0, 100);
      if (w <= 0) return '';
      return (
        `<div class="vote-share-seg" style="width:${w.toFixed(2)}%;background:${partyFillColor(c.party, true)}" ` +
        `title="${esc(c.ballotName)} — ${fmtPct(c.percentage)}%"></div>`
      );
    })
    .join('');
  if (!segs) return '';
  return (
    '<div class="vote-share-caption muted">Distribuição parcial dos votos</div>' +
    `<div class="vote-share-bar">${segs}</div>`
  );
}

export function SummaryCards(results: ElectionResults, sectionsPercent: number | null): string {
  // Mostra a contagem bruta (X de Y seções) junto do percentual sempre que
  // disponível (modo TSE) — além de informativo, é o que permite comparar
  // diretamente com o número bruto do site oficial do TSE quando o
  // percentual por si só parecer divergente.
  const rawCounts =
    results.sectionsTotal !== undefined && results.sectionsCounted !== undefined
      ? `<div>${fmtInt(results.sectionsCounted)} de ${fmtInt(results.sectionsTotal)} seções</div>`
      : '';
  // Um card só (em vez dos 3 antigos: "Seções totalizadas", "Votos
  // apurados" e "Votos válidos" separados) — os votos válidos só fazem
  // sentido já contextualizados pelo total apurado, daí "X de Y votos
  // apurados" em vez de dois números soltos em cards diferentes.
  const votesLine = `<div>${fmtInt(results.totalValid)} de ${fmtInt(results.totalApurados)} votos apurados</div>`;
  return (
    '<div class="apuracao-card">' +
    '<div class="apuracao-head">' +
    '<div><div class="label">Seções totalizadas</div>' +
    (sectionsPercent === null
      ? '<div class="value num">—</div>'
      : `<div class="value num">${fmtPct(sectionsPercent)}<small>%</small></div>`) +
    '</div>' +
    `<div class="apuracao-hint">${rawCounts}${votesLine}</div>` +
    '</div>' +
    `<div class="progress-track"><div class="progress-fill" style="width:${sectionsPercent === null ? 0 : clamp(sectionsPercent, 0, 100)}%"></div></div>` +
    VoteShareBar(results) +
    '</div>'
  );
}

export function UpdateRow(app: AppContext): string {
  const status = statusForT(app.sim.t);
  const statusClass = status.key === 'final' ? 'final' : status.key === 'aguardando' ? 'wait' : '';
  const nextIn = app.state.autoRefresh && app.sim.t < 1 ? Math.round(app.state.refreshInterval / 1000) + 's' : null;
  const intervalOptions = [10_000, 30_000, 60_000, 120_000]
    .map((ms) => {
      const label = ms < 60_000 ? ms / 1000 + 's' : ms / 60_000 + ' min';
      return `<option value="${ms}" ${app.state.refreshInterval === ms ? 'selected' : ''}>${label}</option>`;
    })
    .join('');

  return (
    '<div class="update-row">' +
    `<span class="status-tag ${statusClass}">${status.label}</span>` +
    `<span class="update-left"><span class="dot ${app.sim.fetchError ? 'err' : 'pulse'}"></span>${
      app.sim.fetchError ? 'Falha na última tentativa' : timeAgoLabel(app.state.lastUpdate)
    }</span>` +
    (nextIn ? `<span class="update-left">Próxima atualização em <span class="num">${nextIn}</span></span>` : '') +
    '<span class="grow"></span>' +
    `<label class="toggle"><span class="switch ${app.state.autoRefresh ? 'on' : ''}" data-action="toggle-autorefresh" role="switch" aria-checked="${app.state.autoRefresh}" tabindex="0" aria-label="Atualização automática"></span>Atualização automática</label>` +
    `<select class="ui" data-action="set-interval" aria-label="Intervalo de atualização automática" style="font-size:12.5px; padding:6px 8px;">${intervalOptions}</select>` +
    `<button class="btn primary" data-action="refresh-now">${ICONS.refresh} Atualizar agora</button>` +
    '</div>'
  );
}
