import { UFS, OFFICES } from '../data/domain';
import type { OfficeKey } from '../data/types';
import type { AppContext } from '../state/appContext';
import { esc } from '../util';
import { ICONS } from './icons';

function nationalScopeTag(app: AppContext, office: OfficeKey): string {
  const uf = app.officeUf(office);
  if (!uf) return '<div class="status-tag" style="padding:8px 12px;">Brasil</div>';
  return (
    `<div class="status-tag" style="padding:8px 12px;">${esc(uf)} ` +
    `<button type="button" class="btn" style="padding:2px 8px;margin-left:6px;" ` +
    `data-action="set-map-uf" data-office="${office}" data-value="${esc(uf)}">ver Brasil</button></div>`
  );
}

/** Campo "Estado" (gatilho + painel de siglas) — reaproveitado também em `OverviewPage`, fora da barra de filtros de um cargo específico. */
export function UfPickerField(app: AppContext): string {
  const open = app.state.ufPickerOpen;
  const options = UFS.map(
    (u) =>
      `<button type="button" class="uf-opt ${app.state.uf === u.sigla ? 'active' : ''}" role="option" ` +
      `aria-selected="${app.state.uf === u.sigla}" data-action="set-uf" data-value="${u.sigla}" title="${esc(u.nome)}">${u.sigla}</button>`,
  ).join('');
  return (
    '<div class="field uf-picker"><label id="lbl-uf">Estado</label>' +
    `<button type="button" class="uf-trigger" data-action="toggle-uf-picker" aria-haspopup="listbox" aria-expanded="${open}" aria-labelledby="lbl-uf">` +
    `<span>${esc(app.state.uf)}</span>${ICONS.chevronDown}</button>` +
    (open ? `<div class="uf-panel" role="listbox" aria-label="Selecionar estado">${options}</div>` : '') +
    '</div>'
  );
}

export interface FilterBarOpts {
  search?: boolean;
}

export function FilterBar(app: AppContext, office: OfficeKey, opts: FilterBarOpts = {}): string {
  const cfg = OFFICES[office];
  const showUf = cfg.scope !== 'national';
  const showSearch = opts.search !== false;

  const turnSeg =
    '<div class="field"><label id="lbl-turno">Turno</label>' +
    '<div class="seg" role="group" aria-labelledby="lbl-turno">' +
    `<button aria-pressed="${app.state.turn === 1}" data-action="set-turn" data-value="1">1º Turno</button>` +
    `<button aria-pressed="${app.state.turn === 2}" data-action="set-turn" data-value="2">2º Turno</button>` +
    '</div></div>';

  const ufField = showUf
    ? UfPickerField(app)
    : `<div class="field"><label>Abrangência</label>${nationalScopeTag(app, office)}</div>`;

  const searchField = showSearch
    ? '<div class="field grow"><label for="cand-search">Pesquisar candidato</label>' +
      `<div class="search-wrap">${ICONS.search}` +
      `<input class="search-input" id="cand-search" type="text" placeholder="Nome, número ou partido..." ` +
      `value="${esc(app.state.search)}" data-action="search" aria-label="Pesquisar candidato por nome, nome de urna, número ou partido">` +
      '</div></div>'
    : '';

  return `<div class="filters">${turnSeg}${ufField}${searchField}</div>`;
}
