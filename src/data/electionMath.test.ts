import { describe, expect, it } from 'vitest';
import { computeMathematicallyDecided } from './electionMath';

describe('computeMathematicallyDecided — maioria absoluta (Presidente/Governador, 1º turno)', () => {
  const requiresAbsoluteMajority = true;
  const seats = 1;

  it('declara o líder eleito quando ele já teria mais de 50% mesmo perdendo todos os votos restantes', () => {
    // líder 60 de 100 válidos, 0 restantes — 60/100 = 60%, não dá pra cair abaixo de 50%.
    const decided = computeMathematicallyDecided({
      votes: [60, 40],
      totalValid: 100,
      maxRemainingVotes: 0,
      seats,
      requiresAbsoluteMajority,
    });
    expect(decided).toEqual([true, false]);
  });

  it('não declara ninguém quando o líder poderia cair para 50% ou menos no pior caso', () => {
    // líder 51 de 100 válidos, 10 restantes (pior caso: nenhum é dele) —
    // total final poderia chegar a 110, e 51 não é mais que 55 (metade de 110).
    const decided = computeMathematicallyDecided({
      votes: [51, 49],
      totalValid: 100,
      maxRemainingVotes: 10,
      seats,
      requiresAbsoluteMajority,
    });
    expect(decided).toEqual([false, false]);
  });

  it('declara o líder eleito quando a margem é grande o bastante para absorver o teto de votos restantes', () => {
    // líder 70 de 100, 10 restantes — total final máximo 110, 70 > 55.
    const decided = computeMathematicallyDecided({
      votes: [70, 30],
      totalValid: 100,
      maxRemainingVotes: 10,
      seats,
      requiresAbsoluteMajority,
    });
    expect(decided).toEqual([true, false]);
  });

  it('nunca declara ninguém quando maxRemainingVotes é negativo (dado inconsistente)', () => {
    const decided = computeMathematicallyDecided({
      votes: [90, 10],
      totalValid: 100,
      maxRemainingVotes: -5,
      seats,
      requiresAbsoluteMajority,
    });
    expect(decided).toEqual([false, false]);
  });
});

describe('computeMathematicallyDecided — maioria simples, 1 vaga (2º turno)', () => {
  const requiresAbsoluteMajority = false;
  const seats = 1;

  it('declara o líder eleito quando a margem para o 2º colocado é maior que o teto de votos restantes', () => {
    // líder 50, segundo 30, restantes 15 — margem (20) > restantes (15).
    const decided = computeMathematicallyDecided({
      votes: [50, 30],
      totalValid: 80,
      maxRemainingVotes: 15,
      seats,
      requiresAbsoluteMajority,
    });
    expect(decided).toEqual([true, false]);
  });

  it('não declara ninguém quando o 2º colocado ainda poderia alcançar o líder', () => {
    // líder 50, segundo 30, restantes 25 — margem (20) não é maior que 25.
    const decided = computeMathematicallyDecided({
      votes: [50, 30],
      totalValid: 80,
      maxRemainingVotes: 25,
      seats,
      requiresAbsoluteMajority,
    });
    expect(decided).toEqual([false, false]);
  });
});

describe('computeMathematicallyDecided — maioria simples, N vagas (ex.: Senador)', () => {
  const requiresAbsoluteMajority = false;

  it('declara os 2 primeiros eleitos quando ambos estão à frente do 3º além do teto de votos restantes', () => {
    const decided = computeMathematicallyDecided({
      votes: [100, 80, 70, 20],
      totalValid: 270,
      maxRemainingVotes: 5,
      seats: 2,
      requiresAbsoluteMajority,
    });
    // 100 > 70+5=75 ✓; 80 > 75 ✓; 70 e 20 não contam (fora do top-2).
    expect(decided).toEqual([true, true, false, false]);
  });

  it('não declara o 2º colocado quando o 3º ainda poderia alcançá-lo', () => {
    const decided = computeMathematicallyDecided({
      votes: [100, 80, 78, 20],
      totalValid: 278,
      maxRemainingVotes: 5,
      seats: 2,
      requiresAbsoluteMajority,
    });
    // 100 > 78+5=83 ✓; 80 > 83? não.
    expect(decided).toEqual([true, false, false, false]);
  });

  it('reordenação só dentro das N vagas não muda quem está decidido', () => {
    // 2º e 3º colocados muito próximos entre si, mas ambos claramente à
    // frente do 4º — o corte que importa é entre a 2ª e a 3ª posição.
    const decided = computeMathematicallyDecided({
      votes: [100, 51, 50, 10],
      totalValid: 211,
      maxRemainingVotes: 5,
      seats: 2,
      requiresAbsoluteMajority,
    });
    // corte = votos do 3º colocado (50). 100>55 ✓; 51>55? não (margem de só 1
    // voto sobre o 3º colocado, não é segura mesmo com poucos votos restantes).
    expect(decided).toEqual([true, false, false, false]);
  });
});

describe('computeMathematicallyDecided — casos degenerados', () => {
  it('devolve tudo false para uma lista vazia de candidatos', () => {
    expect(
      computeMathematicallyDecided({
        votes: [],
        totalValid: 0,
        maxRemainingVotes: 0,
        seats: 1,
        requiresAbsoluteMajority: true,
      }),
    ).toEqual([]);
  });

  it('nunca declara ninguém quando seats < 1', () => {
    const decided = computeMathematicallyDecided({
      votes: [100, 1],
      totalValid: 101,
      maxRemainingVotes: 0,
      seats: 0,
      requiresAbsoluteMajority: false,
    });
    expect(decided).toEqual([false, false]);
  });
});
