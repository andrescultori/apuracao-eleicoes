import { OFFICES } from '../data/domain';
import type { OfficeKey, PageKey, Turn } from '../data/types';
import type { AppContext } from '../state/appContext';
import { timeAgoLabel } from '../state/appContext';
import { render } from './app';

export function setupEvents(app: AppContext, root: HTMLElement): void {
  const rerender = (): void => render(app, root);

  // `render()` troca `root.innerHTML` inteiro, inclusive o menu superior —
  // até numa renderização disparada em segundo plano (autoatualização,
  // resposta do TSE chegando). Se isso acontecer entre o toque e o soltar do
  // dedo num link do menu, o elemento sob o dedo é removido do documento no
  // meio do gesto, e o navegador nunca dispara o "click" (nenhum erro, só
  // nada acontece) — o relato de "às vezes clico e nada acontece" bate com
  // essa janela de corrida. Enquanto um ponteiro está pressionado, uma
  // renderização que não veio do próprio clique fica pendente.
  //
  // O "flush" dessa renderização pendente roda no listener de "click"
  // registrado mais abaixo (depois do switch de data-action, por ordem de
  // registro) — não em "pointerup": testado ao vivo, um `setTimeout(fn, 0)`
  // agendado dentro do handler de "pointerup" roda ANTES do "click" da mesma
  // interação (não depois, como seria de esperar pela ordem dos eventos) —
  // teria recriado o DOM antes do clique chegar, o mesmo bug que estamos
  // corrigindo. Rodar o flush dentro do próprio "click" garante que a ação
  // dele já foi processada contra o DOM correto. Um temporizador em
  // "pointerup" serve só de rede de segurança, para gestos que nunca
  // terminam em "click" (um arrastar, por exemplo) não deixarem o ponteiro
  // "preso" para sempre.
  let pointerActive = false;
  let renderPending = false;
  let safetyFlushTimer: ReturnType<typeof setTimeout> | null = null;
  const rerenderDeferred = (): void => {
    if (pointerActive) {
      renderPending = true;
      return;
    }
    rerender();
  };
  const flushPendingRender = (): void => {
    if (safetyFlushTimer) {
      clearTimeout(safetyFlushTimer);
      safetyFlushTimer = null;
    }
    pointerActive = false;
    if (renderPending) {
      renderPending = false;
      rerender();
    }
  };
  document.addEventListener('pointerdown', () => {
    if (safetyFlushTimer) {
      clearTimeout(safetyFlushTimer);
      safetyFlushTimer = null;
    }
    pointerActive = true;
  });
  document.addEventListener('pointerup', () => {
    safetyFlushTimer = setTimeout(flushPendingRender, 200);
  });
  document.addEventListener('pointercancel', flushPendingRender);
  app.onChange = rerenderDeferred;

  let autoTimer: ReturnType<typeof setInterval> | null = null;
  function resetAutoRefreshTimer(): void {
    if (autoTimer) clearInterval(autoTimer);
    if (app.state.autoRefresh) {
      autoTimer = setInterval(() => app.tick(), app.state.refreshInterval);
    }
  }

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    // Fecha o painel do seletor de estado ao clicar fora dele — o próprio
    // clique em "set-uf"/"toggle-uf-picker" fecha pelo switch abaixo, então
    // isso só cobre cliques em outro lugar da página.
    if (app.state.ufPickerOpen && !target.closest('.uf-picker')) {
      app.state.ufPickerOpen = false;
      app.update();
    }
    const el = target.closest<HTMLElement>('[data-action]');
    if (!el) return;
    const action = el.getAttribute('data-action');

    switch (action) {
      case 'toggle-uf-picker':
        app.state.ufPickerOpen = !app.state.ufPickerOpen;
        app.update();
        return;
      case 'set-uf':
        app.state.uf = el.getAttribute('data-value')!;
        app.state.ufPickerOpen = false;
        app.persist();
        return;
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
      case 'set-map-uf': {
        const office = el.getAttribute('data-office') as OfficeKey;
        const value = el.getAttribute('data-value')!;
        if (OFFICES[office].scope === 'national') {
          // Clicar de novo na mesma UF desmarca, voltando à visão Brasil
          // inteiro — cargos nacionais (Presidente) não têm uma UF "padrão"
          // como os de abrangência estadual (que sempre têm alguma selecionada).
          app.state.nationalUfFilter = app.state.nationalUfFilter === value ? null : value;
        } else {
          app.state.uf = value;
        }
        app.persist();
        return;
      }
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
      case 'set-votebasis':
        app.state.voteBasis = el.getAttribute('data-value') as 'valid' | 'total';
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

  // Registrado depois do listener acima (mesmo evento "click", mesmo
  // alvo) — roda em seguida, por ordem de registro, já com a ação do
  // clique processada. Ver nota em `flushPendingRender`.
  document.addEventListener('click', flushPendingRender);

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
    if (e.key === 'Escape' && app.state.ufPickerOpen) {
      app.state.ufPickerOpen = false;
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
