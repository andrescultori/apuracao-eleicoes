import type { AppContext } from '../state/appContext';
import { lastUpdateWallClock, timeAgoLabel } from '../state/appContext';
import { ICONS } from './icons';

export function Header(app: AppContext): string {
  return (
    '<div class="topbar">' +
    '<div class="shell topbar-inner">' +
    '<div class="brand">' +
    `<div class="brand-mark">${ICONS.vote}</div>` +
    '<div class="brand-text">' +
    '<h1>Apuração 2026</h1>' +
    '<p>Resultados eleitorais em tempo real</p>' +
    '</div>' +
    '</div>' +
    '<div class="topbar-actions">' +
    '<div class="status-col">' +
    '<span class="status-pill" aria-live="polite">' +
    `<span class="dot ${app.sim.fetchError ? 'err' : 'pulse'}"></span>` +
    `<span>${app.sim.fetchError ? 'Falha ao atualizar' : timeAgoLabel(app.state.lastUpdate)}</span>` +
    '</span>' +
    `<span class="status-clock num">${lastUpdateWallClock(app.state.lastUpdate)}</span>` +
    '</div>' +
    `<button class="icon-btn" data-action="refresh-now" aria-label="Atualizar agora" title="Atualizar agora">${ICONS.refresh}</button>` +
    `<button class="icon-btn" data-action="open-settings" aria-label="Configurações" title="Configurações">${ICONS.settings}</button>` +
    '</div>' +
    '</div>' +
    '</div>'
  );
}

/**
 * O status do modo ativo (demonstração ou dados oficiais do TSE) mora em
 * "Configurações" — ver `settingsModal.ts` — não mais numa barra fixa no
 * topo de toda página, para manter a tela principal mais limpa. Só a falha
 * de atualização (algo que acabou de dar errado, não um indicador de modo)
 * continua aparecendo aqui.
 */
export function FetchErrorBanner(app: AppContext): string {
  if (!app.sim.fetchError) return '';
  return (
    '<div class="error-banner shell" style="max-width:1180px;margin:0 auto;">' +
    '⚠ Não foi possível atualizar os dados. Exibindo última atualização disponível.</div>'
  );
}
