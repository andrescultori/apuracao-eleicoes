import { describe, expect, it } from 'vitest';
import { AppContext } from '../state/appContext';
import { OverviewPage } from './overviewPage';

describe('OverviewPage — seletor de estado', () => {
  it('mostra o campo "Estado", com a sigla atual, afetando todos os cargos de abrangência estadual', () => {
    const app = new AppContext();
    app.state.uf = 'RJ';
    const html = OverviewPage(app);
    expect(html).toContain('class="field uf-picker"');
    expect(html).toContain('data-action="toggle-uf-picker"');
    expect(html).toContain('>RJ<');
  });

  it('com o painel aberto, lista as siglas como opções clicáveis (mesma ação global "set-uf" das páginas de cargo)', () => {
    const app = new AppContext();
    app.state.ufPickerOpen = true;
    const html = OverviewPage(app);
    expect(html).toContain('class="uf-panel"');
    expect(html).toContain('data-action="set-uf" data-value="SP"');
  });
});
