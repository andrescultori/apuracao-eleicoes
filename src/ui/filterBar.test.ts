import { describe, expect, it } from 'vitest';
import { AppContext } from '../state/appContext';
import { FilterBar } from './filterBar';

describe('FilterBar — campo "Abrangência" de cargos nacionais (Presidente)', () => {
  it('mostra um seletor (gatilho + "Brasil" como opção) em vez de só um rótulo fixo', () => {
    const app = new AppContext();
    const html = FilterBar(app, 'presidente');
    expect(html).toContain('Abrangência');
    expect(html).toContain('data-action="toggle-uf-picker"');
    expect(html).toContain('>Brasil<');
  });

  it('sem UF selecionada, o gatilho mostra "Brasil" e a opção "Brasil" vem marcada', () => {
    const app = new AppContext();
    const html = FilterBar(app, 'presidente');
    expect(html).toContain('<span>Brasil</span>');
  });

  it('com uma UF selecionada (nationalUfFilter), o gatilho mostra a sigla', () => {
    const app = new AppContext();
    app.state.nationalUfFilter = 'SP';
    const html = FilterBar(app, 'presidente');
    expect(html).toContain('<span>SP</span>');
  });

  it('painel aberto (ufPickerOpen) lista as 27 UFs além de "Brasil", com data-action="set-map-uf"', () => {
    const app = new AppContext();
    app.state.ufPickerOpen = true;
    const html = FilterBar(app, 'presidente');
    const matches = html.match(/data-action="set-map-uf"/g) ?? [];
    expect(matches.length).toBe(27);
    expect(html).toContain('data-action="clear-map-uf"');
  });

  it('painel fechado por padrão — nenhuma opção de UF aparece', () => {
    const app = new AppContext();
    const html = FilterBar(app, 'presidente');
    expect(html).not.toContain('data-action="set-map-uf"');
    expect(html).not.toContain('data-action="clear-map-uf"');
  });

  it('cargos de abrangência estadual continuam usando o seletor de Estado normal, não o de Abrangência', () => {
    const app = new AppContext();
    const html = FilterBar(app, 'governador');
    expect(html).toContain('Estado');
    expect(html).not.toContain('Abrangência');
  });
});
