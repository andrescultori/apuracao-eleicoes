import { partyFillColor } from '../data/partyColors';
import type { ElectionResults } from '../data/types';
import { esc, fmtInt, fmtPct } from '../util';

/**
 * Card de confronto direto (2 candidatos lado a lado + barra proporcional +
 * diferença) — só faz sentido quando a corrida tem exatamente 2 candidatos
 * (2º turno de Presidente/Governador, ou um raro 1º turno com só 2
 * concorrentes). Nunca declara vencedor — só mostra o placar — porque
 * `applyElectionCertainty` (appContext.ts) está desligada até confiarmos no
 * dado de eleitorado do TSE contra o ambiente oficial (ver nota lá).
 *
 * As larguras da barra são renormalizadas só entre os 2 candidatos (sempre
 * somam 100%), não sobre o total apurado — a barra é sobre o confronto
 * entre eles, não sobre votos brancos/nulos que ficariam de fora.
 *
 * Cores vêm de `partyFillColor` (mesma função já usada no mapa — nunca uma
 * fonte oficial de cor de partido, o TSE não publica isso, só uma
 * aproximação visual estável por sigla). `decided: true` aqui é só pra
 * pegar o tom mais saturado — não tem relação com "eleito matematicamente".
 */
export function HeadToHeadBar(results: ElectionResults): string {
  if (results.candidates.length !== 2) return '';
  const sorted = results.candidates.slice().sort((x, y) => y.votes - x.votes);
  const a = sorted[0]!;
  const b = sorted[1]!;

  const sumPct = a.percentage + b.percentage;
  const widthA = sumPct > 0 ? (a.percentage / sumPct) * 100 : 50;
  const widthB = 100 - widthA;

  const colorA = partyFillColor(a.party, true);
  const colorB = partyFillColor(b.party, true);

  const diffVotes = Math.abs(a.votes - b.votes);
  const diffPct = Math.abs(a.percentage - b.percentage);

  return (
    '<div class="h2h-card">' +
    '<div class="h2h-row">' +
    '<div class="h2h-cand h2h-left">' +
    `<div class="h2h-name" title="${esc(a.name)}">${esc(a.ballotName)}</div>` +
    `<div class="h2h-meta"><span class="party-chip">${esc(a.party)}</span> ${esc(a.number)}</div>` +
    `<div class="h2h-pct num" style="color:${colorA}">${fmtPct(a.percentage)}%</div>` +
    `<div class="h2h-votes num">${fmtInt(a.votes)} votos</div>` +
    '</div>' +
    '<div class="h2h-cand h2h-right">' +
    `<div class="h2h-name" title="${esc(b.name)}">${esc(b.ballotName)}</div>` +
    `<div class="h2h-meta"><span class="party-chip">${esc(b.party)}</span> ${esc(b.number)}</div>` +
    `<div class="h2h-pct num" style="color:${colorB}">${fmtPct(b.percentage)}%</div>` +
    `<div class="h2h-votes num">${fmtInt(b.votes)} votos</div>` +
    '</div>' +
    '</div>' +
    '<div class="h2h-track">' +
    '<div class="h2h-segs">' +
    `<div class="h2h-seg" style="width:${widthA.toFixed(2)}%;background:${colorA}"></div>` +
    `<div class="h2h-seg" style="width:${widthB.toFixed(2)}%;background:${colorB}"></div>` +
    '</div>' +
    '<div class="h2h-center-line"></div>' +
    '<div class="h2h-center-badge">50%</div>' +
    '</div>' +
    '<div class="h2h-diff">Diferença: ' +
    `<strong>${fmtInt(diffVotes)} votos</strong>` +
    ` <span class="muted">(${fmtPct(diffPct)} pontos percentuais)</span>` +
    '</div>' +
    '</div>'
  );
}
