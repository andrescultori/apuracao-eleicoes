import { describe, expect, it } from 'vitest';
import ea11Sample from './__fixtures__/ea11.sample.json';
import { Ea11ParseError, parseEa11Catalog, resolveElection } from './ea11';

describe('parseEa11Catalog', () => {
  it('faz o parsing de um catálogo real (simulado, campos numéricos como string)', () => {
    const catalog = parseEa11Catalog(ea11Sample);
    expect(catalog.pl).toHaveLength(1);
    expect(catalog.pl[0]?.c).toBe('ele2026');
    expect(catalog.pl[0]?.e).toHaveLength(3);
  });

  it('coage campos numéricos vindos como string para number', () => {
    const catalog = parseEa11Catalog(ea11Sample);
    const federal = catalog.pl[0]?.e.find((e) => e.tp === 8);
    expect(federal?.cd).toBe(21270);
    expect(federal?.cdt2).toBe(21271);
    expect(federal?.t).toBe(1);
  });

  it('trata cdt2 vazio ("") como ausente', () => {
    const catalog = parseEa11Catalog(ea11Sample);
    const municipal = catalog.pl[0]?.e.find((e) => e.tp === 3);
    expect(municipal?.cdt2).toBeUndefined();
  });

  it('faz o parsing dos cargos (cp[]) de cada abrangência', () => {
    const catalog = parseEa11Catalog(ea11Sample);
    const estadual = catalog.pl[0]?.e.find((e) => e.tp === 1);
    const cargos = estadual?.abr[0]?.cp.map((c) => c.cd);
    expect(cargos).toEqual([3, 5, 6, 7, 8]);
  });

  it('faz o parsing do template de diretório em arq[]', () => {
    const catalog = parseEa11Catalog(ea11Sample);
    const arqU = catalog.arq.find((a) => a.tp === 'u');
    expect(arqU?.dir).toBe('<base>/<ambiente>/<ciclo>/<cd_eleicao>/dados/<uf>');
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

  it('resolve a eleição federal (presidente) — tp=8, cp[].cd=1', () => {
    const resolved = resolveElection(catalog, 'presidente', 1);
    expect(resolved).not.toBeNull();
    expect(resolved?.cdEleicao).toBe(21270);
    expect(resolved?.ciclo).toBe('ele2026');
    expect(resolved?.cdEleicaoTurno2).toBe(21271);
  });

  it('resolve a eleição estadual (senador) — tp=1, cp[].cd=5, mesma eleição do governador', () => {
    const resolved = resolveElection(catalog, 'senador', 1);
    expect(resolved?.cdEleicao).toBe(21272);
    expect(resolved?.cdEleicaoTurno2).toBe(21273);
  });

  it('resolve a eleição estadual (governador) — tp=1, cp[].cd=3', () => {
    const resolved = resolveElection(catalog, 'governador', 1);
    expect(resolved?.cdEleicao).toBe(21272);
  });

  it('resolve a eleição estadual (deputado federal) — mesma eleição do governador, não da eleição federal', () => {
    const resolved = resolveElection(catalog, 'deputadoFederal', 1);
    expect(resolved?.cdEleicao).toBe(21272);
  });

  it('resolve a eleição estadual (deputado estadual)', () => {
    const resolved = resolveElection(catalog, 'deputadoEstadual', 1);
    expect(resolved?.cdEleicao).toBe(21272);
  });

  it('devolve null quando não há eleição do turno pedido (turno 1 sem cp compatível)', () => {
    const primeiroPleito = ea11Sample.pl[0]!;
    const semCargo = parseEa11Catalog({
      ...ea11Sample,
      pl: [{ ...primeiroPleito, e: [primeiroPleito.e[0]!] }],
    });
    const resolved = resolveElection(semCargo, 'presidente', 1);
    expect(resolved).toBeNull();
  });

  it('resolve o turno 2 quando a eleição de turno 1 tem cdt2', () => {
    const resolved = resolveElection(catalog, 'presidente', 2);
    expect(resolved?.cdEleicaoTurno2).toBe(21271);
  });
});
