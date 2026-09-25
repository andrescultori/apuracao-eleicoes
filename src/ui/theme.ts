import type { AppState } from '../state/store';

export function applyTheme(state: AppState): void {
  const root = document.documentElement;
  if (state.theme === 'light') root.setAttribute('data-theme', 'light');
  else if (state.theme === 'dark') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
}
