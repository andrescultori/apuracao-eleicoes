import { OFFICE_ORDER, OFFICES } from '../data/domain';
import { statusForT } from '../data/mockDataProvider';
import type { AppContext } from '../state/appContext';
import { esc, fmtPct } from '../util';

export function OverviewPage(app: AppContext): string {
  const cards = OFFICE_ORDER.map((office) => {
    const cfg = OFFICES[office];
    const uf = app.officeUf(office);
    const results = app.getOfficeResults(office, uf, 1);
    const leader = results.candidates[0];
    const status = app.state.dataMode === 'tse' ? { label: 'Dados indisponíveis' } : statusForT(app.sim.t);
    return (
      `<button class="overview-card" data-action="go" data-page="${office}">` +
      `<div class="office-name">${cfg.label}${uf ? ' — ' + uf : ' — Brasil'}</div>` +
      (leader
        ? `<div class="leader-pct num">${fmtPct(leader.percentage)}%</div><div class="leader-name">${esc(leader.name)}</div>`
        : '<div class="leader-name">Sem dados</div>') +
      `<div class="office-status">${status.label}</div>` +
      '</button>'
    );
  }).join('');

  return (
    '<div class="stack">' +
    `<div class="section-head"><h2>Eleições 2026</h2><span class="muted">1º turno · estado de referência: ${app.state.uf}</span></div>` +
    `<div class="overview-grid">${cards}</div>` +
    '</div>'
  );
}
