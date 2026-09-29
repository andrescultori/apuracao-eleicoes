import type { ProviderStatus } from '../data/types';
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

const TSE_STATUS_BANNER_LABEL: Record<ProviderStatus, string> = {
  ready:
    'MODO DADOS OFICIAIS (TSE) — conectado ao catálogo do TSE; a assinatura de cada arquivo é verificada antes de exibir dados.',
  loading: 'MODO DADOS OFICIAIS (TSE) — buscando e verificando os dados do TSE...',
  error: 'MODO DADOS OFICIAIS (TSE) — não foi possível obter ou verificar os dados do TSE agora. Ver "Sobre os dados".',
  unconfigured:
    'MODO DADOS OFICIAIS (TSE) — esta eleição ainda não está disponível no catálogo publicado pelo TSE. Ver "Sobre os dados".',
};

export function DemoBanner(app: AppContext): string {
  let html: string;
  if (app.state.dataMode === 'tse') {
    const label = TSE_STATUS_BANNER_LABEL[app.electionDataStatus()];
    html = `<div class="demo-banner"><div class="shell">ⓘ ${label}</div></div>`;
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
