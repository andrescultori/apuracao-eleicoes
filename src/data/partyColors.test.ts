import { describe, expect, it } from 'vitest';
import { partyFillColor } from './partyColors';

describe('partyFillColor', () => {
  it('é determinístico: a mesma sigla sempre dá a mesma cor', () => {
    expect(partyFillColor('PT', false)).toBe(partyFillColor('PT', false));
    expect(partyFillColor('PT', true)).toBe(partyFillColor('PT', true));
  });

  it('usa um matiz consistente entre o estado "decidido" e "em aberto" do mesmo partido', () => {
    const open = partyFillColor('PT', false);
    const decided = partyFillColor('PT', true);
    const hueOf = (s: string): string => s.match(/hsl\((\d+)/)?.[1] ?? '';
    expect(hueOf(open)).toBe(hueOf(decided));
    expect(open).not.toBe(decided);
  });

  it('a cor "decidida" é mais escura (menor luminosidade) que a "em aberto"', () => {
    const lightnessOf = (s: string): number => Number(s.match(/,\s*(\d+)%\)$/)?.[1] ?? '0');
    expect(lightnessOf(partyFillColor('PT', true))).toBeLessThan(lightnessOf(partyFillColor('PT', false)));
  });

  it('dá uma cor estável e válida mesmo para uma sigla fora da tabela conhecida', () => {
    const color = partyFillColor('PARTIDO-INEXISTENTE-XYZ', false);
    expect(color).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/);
    expect(color).toBe(partyFillColor('PARTIDO-INEXISTENTE-XYZ', false));
  });

  it('não diferencia por maiúsculas/minúsculas ou espaços ao redor da sigla', () => {
    expect(partyFillColor('pt', false)).toBe(partyFillColor('PT', false));
    expect(partyFillColor(' PT ', false)).toBe(partyFillColor('PT', false));
  });

  it('duas siglas diferentes (conhecidas) geram cores diferentes', () => {
    expect(partyFillColor('PT', false)).not.toBe(partyFillColor('PL', false));
  });
});
