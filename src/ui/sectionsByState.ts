import { UFS } from '../data/domain';
import type { OfficeKey, Turn, Uf } from '../data/types';
import type { AppContext } from '../state/appContext';
import { clamp, esc, fmtPct } from '../util';
import { supportsMap } from './brazilMap';

/**
 * Card com o percentual de seções totalizadas de cada UF, ordenado do maior
 * pro menor — ao lado do mapa (que já busca o resultado por UF da mesma
 * forma, para colorir cada estado), mas focado em "quanto já foi apurado",
 * não em quem está liderando. Só para os cargos com mapa (Presidente e
 * Governador) — os únicos onde "por estado" faz sentido (ver `brazilMap.ts`).
 */
export function SectionsByStateCard(app: AppContext, office: OfficeKey, turn: Turn): string {
  if (!supportsMap(office)) return '';

  const rows = UFS.map((u) => {
    const results = app.getOfficeResults(office, u.sigla, turn);
    return { uf: u, percent: results.sectionsPercent };
  })
    .filter((r): r is { uf: Uf; percent: number } => r.percent !== undefined)
    .sort((a, b) => b.percent - a.percent);

  if (!rows.length) {
    return (
      '<div class="map-card"><div class="section-head" style="margin-bottom:10px;"><h2>Urnas apuradas por estado</h2></div>' +
      '<p class="muted" style="font-size:12.5px;">Dados de seções por UF ainda não disponíveis.</p></div>'
    );
  }

  const items = rows
    .map(
      ({ uf, percent }) =>
        '<div class="bar-row">' +
        `<div class="bar-label sigla" title="${esc(uf.nome)}">${esc(uf.sigla)}</div>` +
        `<div class="bar-track"><div class="bar-fill" style="width:${clamp(percent, 0, 100)}%"></div></div>` +
        `<div class="bar-pct num">${fmtPct(percent)}%</div>` +
        '</div>',
    )
    .join('');

  return (
    '<div class="map-card">' +
    '<div class="section-head" style="margin-bottom:12px;"><h2>Urnas apuradas por estado</h2>' +
    '<span class="muted">% de seções totalizadas, por UF</span></div>' +
    items +
    '</div>'
  );
}
