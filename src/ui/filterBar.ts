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

  let ufField: string;
  if (showUf) {
    const options = UFS.map(
      (u) =>
        `<option value="${u.sigla}" ${app.state.uf === u.sigla ? 'selected' : ''}>${esc(u.nome)} — ${u.sigla}</option>`,
    ).join('');
    ufField =
      '<div class="field"><label for="uf-select">Estado</label>' +
      `<select class="ui" id="uf-select" data-action="set-uf">${options}</select></div>`;
  } else {
    ufField = `<div class="field"><label>Abrangência</label>${nationalScopeTag(app, office)}</div>`;
  }

  const searchField = showSearch
    ? '<div class="field grow"><label for="cand-search">Pesquisar candidato</label>' +
      `<div class="search-wrap">${ICONS.search}` +
      `<input class="search-input" id="cand-search" type="text" placeholder="Nome, número ou partido..." ` +
      `value="${esc(app.state.search)}" data-action="search" aria-label="Pesquisar candidato por nome, nome de urna, número ou partido">` +
      '</div></div>'
    : '';

  return `<div class="filters">${turnSeg}${ufField}${searchField}</div>`;
}
