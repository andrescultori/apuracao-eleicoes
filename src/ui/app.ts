import { OFFICES } from '../data/domain';
import type { AppContext } from '../state/appContext';
import { AboutPage } from './aboutPage';
import { DemoBanner, Header } from './header';
import { FavoritesPage } from './favorites';
import { Footer } from './footer';
import { Nav } from './nav';
import { OfficePage } from './officePage';
import { OverviewPage } from './overviewPage';
import { SettingsModal } from './settingsModal';
import { applyTheme } from './theme';

function pageContent(app: AppContext): string {
  if (app.state.page === 'overview') return OverviewPage(app);
  if (app.state.page === 'favorites') return FavoritesPage(app);
  if (app.state.page === 'about') return AboutPage(app);
  if (app.state.page in OFFICES) return OfficePage(app, app.state.page as keyof typeof OFFICES);
  return OverviewPage(app);
}

export function render(app: AppContext, root: HTMLElement): void {
  applyTheme(app.state);
  root.innerHTML =
    Header(app) +
    DemoBanner(app) +
    Nav(app) +
    `<main class="shell"><div id="page-root">${pageContent(app)}</div></main>` +
    Footer() +
    SettingsModal(app);

  const search = document.getElementById('cand-search') as HTMLInputElement | null;
  if (search && document.activeElement !== search && app.state._focusSearch) {
    search.focus();
    const v = search.value;
    search.value = '';
    search.value = v;
  }
  app.state._focusSearch = false;
}
