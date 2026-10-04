import { UFS, UF_GRID } from '../data/domain';
import { partyFillColor } from '../data/partyColors';
import type { OfficeKey, Turn } from '../data/types';
import type { AppContext } from '../state/appContext';
import { esc, fmtInt, fmtPct } from '../util';

/**
 * Mapa do Brasil clicável, só para Presidente e Governador — os únicos
 * cargos com 1 vaga e regra de vitória simples o bastante para "a cor do
 * estado" significar uma coisa só (ver `electionMath.ts`; Senador e
 * Deputados ficam de fora pelo mesmo motivo que ficaram de fora de "eleito
 * matematicamente"). Não é uma silhueta geográfica real: é um cartograma de
 * grade (como os "mapas de grade" usados por veículos de imprensa para
 * eleições americanas) — ver `UF_GRID` em `domain.ts` para a justificativa.
 *
 * Clicar numa UF busca o resultado daquele estado específico (já suportado
 * pelo provedor de dados — ver `tseDataProvider.ts`) e, para Governador,
 * seleciona essa UF no filtro normal da página (o mesmo `app.state.uf` do
 * seletor); para Presidente (cargo nacional, que normalmente não tem UF
 * nenhuma selecionada), usa um filtro à parte (`app.state.nationalUfFilter`)
 * que também passa a recortar os cartões de resumo e a tabela de candidatos
 * para aquele estado — clicar de novo no mesmo estado desmarca, voltando a
 * ver o Brasil inteiro.
 */
export function officesWithMap(): OfficeKey[] {
  return ['presidente', 'governador'];
}

export function supportsMap(office: OfficeKey): boolean {
  return officesWithMap().includes(office);
}

const COLS = Math.max(...Object.values(UF_GRID).map((p) => p.col)) + 1;
const ROWS = Math.max(...Object.values(UF_GRID).map((p) => p.row)) + 1;

export function BrazilMap(app: AppContext, office: OfficeKey, turn: Turn): string {
  if (!supportsMap(office)) return '';

  const selectedUf = app.officeUf(office);

  const cells = UFS.map((u) => {
    const pos = UF_GRID[u.sigla];
    if (!pos) return '';
    const results = app.getOfficeResults(office, u.sigla, turn);
    const leader = results.candidates[0];
    const isSelected = selectedUf === u.sigla;

    let background: string;
    let title: string;
    let hasData = false;
    if (leader && results.candidates.length) {
      hasData = true;
      background = partyFillColor(leader.party, leader.elected === true);
      const statusLabel = leader.elected ? 'eleito matematicamente' : 'ainda em apuração';
      title =
        `${u.nome} (${u.sigla}): ${leader.name} (${leader.party}) lidera com ${fmtInt(leader.votes)} votos ` +
        `(${fmtPct(leader.percentage)}%) — ${statusLabel}`;
    } else {
      background = 'var(--surface-2)';
      title = `${u.nome} (${u.sigla}): sem dados ainda`;
    }

    return (
      `<button type="button" class="map-cell${hasData ? '' : ' no-data'}${isSelected ? ' selected' : ''}" ` +
      `style="grid-column:${pos.col + 1};grid-row:${pos.row + 1};background:${background};" ` +
      `data-action="set-map-uf" data-office="${office}" data-value="${u.sigla}" ` +
      `aria-pressed="${isSelected}" title="${esc(title)}" aria-label="${esc(title)}">` +
      `<span class="map-cell-label">${u.sigla}</span>` +
      '</button>'
    );
  }).join('');

  const clearButton =
    office === 'presidente' && selectedUf
      ? `<button type="button" class="btn" data-action="set-map-uf" data-office="${office}" data-value="${selectedUf}">` +
        '← Voltar para Brasil</button>'
      : '';

  return (
    '<div class="map-card">' +
    '<div class="section-head" style="margin-bottom:10px;"><h2>Mapa por estado</h2>' +
    '<span class="muted">clique num estado para ver os votos só dali</span></div>' +
    `<div class="brazil-map" style="grid-template-columns:repeat(${COLS}, 1fr);grid-template-rows:repeat(${ROWS}, 1fr);">${cells}</div>` +
    '<div class="map-legend">' +
    '<span class="map-legend-item"><span class="map-legend-swatch light"></span>Resultado ainda em aberto</span>' +
    '<span class="map-legend-item"><span class="map-legend-swatch dark"></span>Eleito matematicamente (não oficial)</span>' +
    '<span class="map-legend-item"><span class="map-legend-swatch" style="background:var(--surface-2);"></span>Sem dados</span>' +
    '</div>' +
    (clearButton ? `<div style="margin-top:10px;">${clearButton}</div>` : '') +
    '<p class="muted" style="font-size:12px;margin-top:10px;">' +
    'Cartograma esquemático (posições relativas, não uma silhueta geográfica real). ' +
    'A cor é do partido do candidato na frente naquele estado; escura só quando a vitória já está matematicamente ' +
    'garantida, nunca uma projeção.' +
    '</p>' +
    '</div>'
  );
}
