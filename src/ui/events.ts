import type { OfficeKey, PageKey, Turn } from '../data/types';
import type { AppContext } from '../state/appContext';
import { timeAgoLabel } from '../state/appContext';
import { render } from './app';

export function setupEvents(app: AppContext, root: HTMLElement): void {
  const rerender = (): void => render(app, root);
  app.onChange = rerender;

  let autoTimer: ReturnType<typeof setInterval> | null = null;
  function resetAutoRefreshTimer(): void {
    if (autoTimer) clearInterval(autoTimer);
    if (app.state.autoRefresh) {
      autoTimer = setInterval(() => app.tick(), app.state.refreshInterval);
    }
  }

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const el = target.closest<HTMLElement>('[data-action]');
    if (!el) return;
    const action = el.getAttribute('data-action');

    switch (action) {
      case 'go': {
        app.state.page = el.getAttribute('data-page') as PageKey;
        app.state.search = '';
        // Chips da barra de favoritos levam direto à corrida do candidato,
        // ajustando turno/UF — os demais botões "go" (nav, cards) não têm
        // esses atributos, então nada muda para eles.
        const gotoUf = el.getAttribute('data-uf');
        const gotoTurn = el.getAttribute('data-turn');
        if (gotoUf) app.state.uf = gotoUf;
        if (gotoTurn) app.state.turn = Number(gotoTurn) as Turn;
        app.persist();
        return;
      }
      case 'set-turn':
        app.state.turn = Number(el.getAttribute('data-value')) as Turn;
        app.persist();
        return;
      case 'toggle-fav':
      case 'unfav': {
        const turn = Number(el.getAttribute('data-turn')) as Turn;
        const office = el.getAttribute('data-office') as OfficeKey;
        const uf = el.getAttribute('data-uf') || null;
        const id = el.getAttribute('data-id')!;
        app.toggleFav(turn, office, uf, id);
        return;
      }
      case 'unfav-key': {
        const key = el.getAttribute('data-key')!;
        app.unfavKey(key);
        return;
      }
      case 'refresh-now':
        app.refreshNow();
        return;
      case 'toggle-autorefresh':
        app.state.autoRefresh = !app.state.autoRefresh;
        app.persist();
        resetAutoRefreshTimer();
        return;
      case 'open-settings':
        app.state.settingsOpen = true;
        app.update();
        return;
      case 'close-settings':
        // O backdrop também tem data-action="close-settings" para fechar ao clicar
        // fora do modal — mas só quando o clique aconteceu nele mesmo, não quando
        // ele apenas herdou a ação por estar mais acima na árvore (o conteúdo do
        // modal não tem data-action próprio, então um clique em qualquer parte dele
        // "borbulharia" até o backdrop se não checássemos isso).
        if (el.classList.contains('modal-backdrop') && target !== el) return;
        app.state.settingsOpen = false;
        app.update();
        return;
      case 'set-datamode':
        app.state.dataMode = el.getAttribute('data-value') as 'mock' | 'tse';
        app.persist();
        return;
      case 'set-tseenv':
        app.state.tseEnv = el.getAttribute('data-value') as 'oficial' | 'simulado';
        app.persist();
        return;
      case 'set-theme':
        app.state.theme = el.getAttribute('data-value') as 'light' | 'dark' | 'system';
        app.persist();
        return;
      default:
        return;
    }
  });

  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if ((e.key === 'Enter' || e.key === ' ') && target.matches('[data-action="toggle-autorefresh"]')) {
      e.preventDefault();
      app.state.autoRefresh = !app.state.autoRefresh;
      app.persist();
      resetAutoRefreshTimer();
    }
    if (e.key === 'Escape' && app.state.settingsOpen) {
      app.state.settingsOpen = false;
      app.update();
    }
  });

  document.addEventListener('input', (e) => {
    const target = e.target as HTMLElement;
    if (target.id === 'cand-search') {
      app.state.search = (target as HTMLInputElement).value;
      app.state._focusSearch = true;
      app.update();
    }
  });

  document.addEventListener('change', (e) => {
    const target = e.target as HTMLElement;
    if (target.id === 'uf-select') {
      app.state.uf = (target as HTMLSelectElement).value;
      app.persist();
    }
    if (target.getAttribute && target.getAttribute('data-action') === 'set-interval') {
      app.state.refreshInterval = Number((target as HTMLSelectElement).value);
      app.persist();
      resetAutoRefreshTimer();
    }
  });

  setInterval(() => {
    // mantém "Atualizado há Xs" fresco sem esperar por uma atualização completa
    const pill = document.querySelector('.status-pill span:last-child');
    if (pill && !app.sim.fetchError) {
      pill.textContent = timeAgoLabel(app.state.lastUpdate);
    }
  }, 1000);

  resetAutoRefreshTimer();
}
