import { OFFICE_ORDER, OFFICES } from '../data/domain';
import type { AppContext } from '../state/appContext';
import { esc } from '../util';

export function Nav(app: AppContext): string {
  const items: { key: string; label: string; badge?: number }[] = [{ key: 'overview', label: 'Visão geral' }];
  OFFICE_ORDER.forEach((o) => items.push({ key: o, label: OFFICES[o].short }));
  items.push({ key: 'favorites', label: 'Meus candidatos', badge: app.state.favorites.length });
  items.push({ key: 'about', label: 'Sobre os dados' });

  const buttons = items
    .map((it) => {
      const sel = app.state.page === it.key;
      return (
        `<button class="nav-item" role="tab" aria-selected="${sel}" data-action="go" data-page="${it.key}">` +
        esc(it.label) +
        (it.badge ? ` <span class="nav-badge">${it.badge}</span>` : '') +
        '</button>'
      );
    })
    .join('');

  return `<div class="nav-wrap"><div class="shell"><nav class="nav" role="tablist" aria-label="Navegação principal">${buttons}</nav></div></div>`;
}
