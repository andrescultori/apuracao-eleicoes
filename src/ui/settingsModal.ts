import type { ThemeMode } from '../data/types';
import type { AppContext } from '../state/appContext';
import { ICONS } from './icons';

const THEME_LABELS: Record<ThemeMode, string> = { light: 'Claro', dark: 'Escuro', system: 'Sistema' };

export function SettingsModal(app: AppContext): string {
  if (!app.state.settingsOpen) return '';
  return (
    '<div class="modal-backdrop" data-action="close-settings">' +
    '<div class="modal" role="dialog" aria-modal="true" aria-label="Configurações">' +
    `<div class="modal-head"><h3>Configurações</h3><button class="icon-btn" data-action="close-settings" aria-label="Fechar">${ICONS.close}</button></div>` +
    '<div class="modal-section">' +
    '<div class="label">Fonte dos dados</div>' +
    '<div class="radio-row" role="radiogroup" aria-label="Fonte dos dados">' +
    `<button aria-pressed="${app.state.dataMode === 'mock'}" data-action="set-datamode" data-value="mock">Demonstração</button>` +
    `<button aria-pressed="${app.state.dataMode === 'tse'}" data-action="set-datamode" data-value="tse">Dados oficiais (TSE)</button>` +
    '</div>' +
    (app.state.dataMode === 'tse'
      ? '<div class="row-desc" style="margin-top:7px;">Endpoint oficial ainda não configurado nesta versão — ver "Sobre os dados".</div>'
      : '') +
    '</div>' +
    '<div class="modal-section">' +
    '<div class="label">Aparência</div>' +
    '<div class="radio-row" role="radiogroup" aria-label="Tema">' +
    (['light', 'dark', 'system'] as ThemeMode[])
      .map(
        (t) =>
          `<button aria-pressed="${app.state.theme === t}" data-action="set-theme" data-value="${t}">${THEME_LABELS[t]}</button>`,
      )
      .join('') +
    '</div>' +
    '</div>' +
    '<div class="modal-section">' +
    '<div class="label">Atualização</div>' +
    '<div class="modal-row"><div><div class="row-label">Atualização automática</div>' +
    '<div class="row-desc">Simula novas apurações periodicamente</div></div>' +
    `<span class="switch ${app.state.autoRefresh ? 'on' : ''}" data-action="toggle-autorefresh" role="switch" aria-checked="${app.state.autoRefresh}" tabindex="0" aria-label="Atualização automática"></span></div>` +
    '</div>' +
    '<div class="modal-section">' +
    '<div class="label">Ambiente TSE</div>' +
    '<div class="radio-row" role="radiogroup" aria-label="Ambiente TSE">' +
    `<button aria-pressed="${app.state.tseEnv === 'oficial'}" data-action="set-tseenv" data-value="oficial" ${app.state.dataMode !== 'tse' ? 'disabled' : ''}>Oficial</button>` +
    `<button aria-pressed="${app.state.tseEnv === 'simulado'}" data-action="set-tseenv" data-value="simulado" ${app.state.dataMode !== 'tse' ? 'disabled' : ''}>Simulado</button>` +
    '</div>' +
    '</div>' +
    '</div>' +
    '</div>'
  );
}
