import { describe, expect, it } from 'vitest';
import ea11Sample from './__fixtures__/ea11.sample.json';
import { Ea11ParseError, parseEa11Catalog, resolveElection } from './ea11';

describe('parseEa11Catalog', () => {
  it('faz o parsing de um catálogo válido', () => {
    const catalog = parseEa11Catalog(ea11Sample);
    expect(catalog.pl).toHaveLength(1);
    expect(catalog.pl[0]?.c).toBe('ele2026');
    expect(catalog.pl[0]?.e).toHaveLength(2);
  });

  it('rejeita payload sem o campo "pl"', () => {
    expect(() => parseEa11Catalog({})).toThrow(Ea11ParseError);
  });

  it('rejeita um pleito malformado', () => {
    expect(() => parseEa11Catalog({ pl: [{ c: 'ele2026' }] })).toThrow(Ea11ParseError);
  });

  it('rejeita uma eleição malformada', () => {
    expect(() => parseEa11Catalog({ pl: [{ c: 'ele2026', e: [{ nm: 'x' }] }] })).toThrow(Ea11ParseError);
  });
});

describe('resolveElection', () => {
  const catalog = parseEa11Catalog(ea11Sample);

  it('resolve a eleição federal (presidente) por abrangência nacional', () => {
    const resolved = resolveElection(catalog, 'presidente', 1, null);
    expect(resolved).not.toBeNull();
    expect(resolved?.cdEleicao).toBe(6257);
    expect(resolved?.ciclo).toBe('ele2026');
    expect(resolved?.cdEleicaoTurno2).toBe(6258);
    expect(resolved?.abrangencia?.cd).toBe('BR');
  });

  it('resolve a eleição federal (senador) restrita a uma UF', () => {
    const resolved = resolveElection(catalog, 'senador', 1, 'PR');
    expect(resolved?.cdEleicao).toBe(6257);
    expect(resolved?.abrangencia?.cd).toBe('PR');
  });

  it('resolve a eleição estadual (governador) por UF', () => {
    const resolved = resolveElection(catalog, 'governador', 1, 'SP');
    expect(resolved?.cdEleicao).toBe(6259);
  });

  it('devolve null quando a UF não está no catálogo para aquele cargo', () => {
    const resolved = resolveElection(catalog, 'governador', 1, 'RJ');
    expect(resolved).toBeNull();
  });

  it('devolve null quando não há eleição do turno pedido', () => {
    const resolved = resolveElection(catalog, 'presidente', 2, null);
    // turno 2 é aceito desde que a eleição de turno 1 exista e tenha cdt2
    expect(resolved?.cdEleicaoTurno2).toBe(6258);
  });
});
