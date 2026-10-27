import { UFS, OFFICES } from '../data/domain';
import type { OfficeKey } from '../data/types';
import type { AppContext } from '../state/appContext';
import { esc } from '../util';
import { ICONS } from './icons';

/**
 * Campo "Abrangência" de cargos nacionais (Presidente) — mesmo visual do
 * seletor de estado (`UfPickerField`), com "Brasil" como 1ª opção pra voltar
 * à visão nacional. Reaproveita `app.state.ufPickerOpen` (o mesmo estado
 * usado por `UfPickerField`) — sem conflito, porque uma página de cargo só
 * renderiza um dos dois campos por vez (nunca os dois juntos).
 */
function NationalScopeField(app: AppContext, office: OfficeKey): string {
  const open = app.state.ufPickerOpen;
  const current = app.officeUf(office);
  const options =
    `<button type="button" class="uf-opt ${!current ? 'active' : ''}" role="option" ` +
    `aria-selected="${!current}" data-action="clear-map-uf">Brasil</button>` +
    UFS.map(
      (u) =>
        `<button type="button" class="uf-opt ${current === u.sigla ? 'active' : ''}" role="option" ` +
        `aria-selected="${current === u.sigla}" data-action="set-map-uf" data-office="${office}" data-value="${u.sigla}" title="${esc(u.nome)}">${u.sigla}</button>`,
    ).join('');
  return (
    '<div class="field uf-picker"><label id="lbl-abrangencia">Abrangência</label>' +
    `<button type="button" class="uf-trigger" data-action="toggle-uf-picker" aria-haspopup="listbox" aria-expanded="${open}" aria-labelledby="lbl-abrangencia">` +
    `<span>${esc(current ?? 'Brasil')}</span>${ICONS.chevronDown}</button>` +
    (open ? `<div class="uf-panel" role="listbox" aria-label="Selecionar abrangência">${options}</div>` : '') +
    '</div>'
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

  const ufField = showUf ? UfPickerField(app) : NationalScopeField(app, office);

  const searchField = showSearch
    ? '<div class="field grow"><label for="cand-search">Pesquisar candidato</label>' +
      `<div class="search-wrap">${ICONS.search}` +
      `<input class="search-input" id="cand-search" type="text" placeholder="Nome, número ou partido..." ` +
      `value="${esc(app.state.search)}" data-action="search" aria-label="Pesquisar candidato por nome, nome de urna, número ou partido">` +
      '</div></div>'
    : '';

  return `<div class="filters">${turnSeg}${ufField}${searchField}</div>`;
}
