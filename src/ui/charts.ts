import { OFFICES } from '../data/domain';
import { generateCandidateList } from '../data/mockDataProvider';
import type { ElectionResults, OfficeKey, Turn } from '../data/types';
import type { AppContext } from '../state/appContext';
import { clamp, esc, fmtPct } from '../util';

export function VoteChart(
  app: AppContext,
  office: OfficeKey,
  turn: Turn,
  uf: string | null,
  results: ElectionResults,
): string {
  if (!results.candidates.length) return '';
  const top = results.candidates.slice(0, 8);
  const rows = top
    .map((c) => {
      const fav = app.isFav(turn, office, uf, c.id);
      return (
        '<div class="bar-row">' +
        `<div class="bar-label">${fav ? '★ ' : ''}${esc(c.name)}</div>` +
        `<div class="bar-track"><div class="bar-fill ${fav ? 'fav' : ''}" style="width:${clamp(c.percentage, 0, 100)}%"></div></div>` +
        `<div class="bar-pct num">${fmtPct(c.percentage)}%</div>` +
        '</div>'
      );
    })
    .join('');
  return `<div class="chart-card"><div class="section-head" style="margin-bottom:12px;"><h2>Distribuição dos votos</h2></div>${rows}</div>`;
}

const PALETTE = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

export function EvolutionChart(app: AppContext, office: OfficeKey, turn: Turn, uf: string | null): string {
  const cfg = OFFICES[office];
  if (turn === 2 && !cfg.hasRunoff) return '';
  if (app.state.dataMode === 'tse') {
    return (
      '<div class="chart-card"><div class="section-head" style="margin-bottom:6px;"><h2>Evolução da apuração</h2></div>' +
      '<p class="muted" style="font-size:12.5px;">O histórico de snapshots para este gráfico ainda não é gravado a partir dos ' +
      'arquivos oficiais do TSE nesta versão — ver "Sobre os dados".</p></div>'
    );
  }
  const candidates = generateCandidateList(office, uf, turn);
  if (!candidates.length) return '';
  const top = candidates
    .slice()
    .sort((a, b) => b.finalShare - a.finalShare)
    .slice(0, Math.min(4, candidates.length));

  const W = 640;
  const H = 220;
  const padL = 34;
  const padR = 14;
  const padT = 14;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const hist = app.sim.history;
  const series = top.map((cand, ci) => {
    const pts = hist.map((h) => {
      const res = app.computeResultsAt(office, uf, turn, h.tick, h.t);
      const found = res.candidates.find((c) => c.id === cand.id);
      return found ? found.percentage : 0;
    });
    return { cand, color: PALETTE[ci % PALETTE.length]!, pts };
  });

  let maxV = 10;
  series.forEach((s) =>
    s.pts.forEach((v) => {
      if (v > maxV) maxV = v;
    }),
  );
  maxV = Math.ceil((maxV + 6) / 10) * 10;

  function xAt(i: number): number {
    return padL + (hist.length <= 1 ? 0 : (i / (hist.length - 1)) * innerW);
  }
  function yAt(v: number): number {
    return padT + innerH - (v / maxV) * innerH;
  }

  let gridLines = '';
  const ticks = 4;
  for (let g = 0; g <= ticks; g++) {
    const val = (maxV / ticks) * g;
    const y = yAt(val);
    gridLines += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--border)" stroke-width="1"/>`;
    gridLines += `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--text-3)">${Math.round(val)}%</text>`;
  }
  const xLabels = hist
    .map((h, i) => {
      if (hist.length > 6 && i % 2 !== 0 && i !== hist.length - 1) return '';
      return `<text x="${xAt(i)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--text-3)">${h.label}</text>`;
    })
    .join('');

  const lines = series
    .map((s) => {
      const d = s.pts.map((v, i) => (i === 0 ? 'M' : 'L') + xAt(i).toFixed(1) + ',' + yAt(v).toFixed(1)).join(' ');
      const lastX = xAt(s.pts.length - 1);
      const lastY = yAt(s.pts[s.pts.length - 1]!);
      return (
        `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<circle cx="${lastX}" cy="${lastY}" r="3.2" fill="${s.color}"/>`
      );
    })
    .join('');

  const legend = series
    .map(
      (s) =>
        `<div class="legend-item"><span class="legend-dot" style="background:${s.color}"></span>${esc(s.cand.name)}</div>`,
    )
    .join('');

  return (
    '<div class="chart-card">' +
    '<div class="section-head" style="margin-bottom:6px;"><h2>Evolução da apuração</h2><span class="muted">percentual de votos ao longo da contagem</span></div>' +
    `<div class="table-scroll"><svg class="chart-svg" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;min-width:520px;" role="img" aria-label="Gráfico de evolução do percentual de votos por candidato ao longo do tempo">` +
    gridLines +
    xLabels +
    lines +
    '</svg></div>' +
    `<div class="legend">${legend}</div>` +
    '</div>'
  );
}
