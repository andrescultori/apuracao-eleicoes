import type { AppContext } from '../state/appContext';
import { timeAgoLabel } from '../state/appContext';
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
    '<span class="status-pill" aria-live="polite">' +
    `<span class="dot ${app.sim.fetchError ? 'err' : 'pulse'}"></span>` +
    `<span>${app.sim.fetchError ? 'Falha ao atualizar' : timeAgoLabel(app.state.lastUpdate)}</span>` +
    '</span>' +
    `<button class="icon-btn" data-action="refresh-now" aria-label="Atualizar agora" title="Atualizar agora">${ICONS.refresh}</button>` +
    `<button class="icon-btn" data-action="open-settings" aria-label="Configurações" title="Configurações">${ICONS.settings}</button>` +
    '</div>' +
    '</div>' +
    '</div>'
  );
}

export function DemoBanner(app: AppContext): string {
  let html: string;
  if (app.state.dataMode === 'tse') {
    html =
      '<div class="demo-banner"><div class="shell">ⓘ MODO DADOS OFICIAIS (TSE) — endpoint ainda não configurado nesta versão. Ver "Sobre os dados".</div></div>';
  } else {
    html =
      '<div class="demo-banner"><div class="shell">⚠ MODO DEMONSTRAÇÃO — DADOS FICTÍCIOS, gerados para fins de demonstração da interface.</div></div>';
  }
  if (app.sim.fetchError) {
    html +=
      '<div class="error-banner shell" style="max-width:1180px;margin:0 auto;">⚠ Não foi possível atualizar os dados. Exibindo última atualização disponível.</div>';
  }
  return html;
}
