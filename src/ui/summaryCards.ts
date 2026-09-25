import type { ElectionResults } from '../data/types';
import type { AppContext } from '../state/appContext';
import { lastUpdateClock, timeAgoLabel } from '../state/appContext';
import { statusForT } from '../data/mockDataProvider';
import { clamp, fmtInt, fmtPct } from '../util';
import { ICONS } from './icons';

export function SummaryCards(
  app: AppContext,
  results: ElectionResults,
  totalSections: number,
  countedSections: number,
): string {
  const pct = totalSections ? (countedSections / totalSections) * 100 : 0;
  return (
    '<div class="summary-grid">' +
    '<div class="card"><div class="label">Seções totalizadas</div>' +
    `<div class="value num">${fmtPct(pct)}<small>%</small></div>` +
    `<div class="progress-track"><div class="progress-fill" style="width:${clamp(pct, 0, 100)}%"></div></div></div>` +
    `<div class="card"><div class="label">Votos apurados</div><div class="value num">${fmtInt(results.totalApurados)}</div></div>` +
    `<div class="card"><div class="label">Votos válidos</div><div class="value num">${fmtInt(results.totalValid)}</div></div>` +
    `<div class="card"><div class="label">Última atualização</div><div class="value num" style="font-size:19px;">${lastUpdateClock(app)}</div></div>` +
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
