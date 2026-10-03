/**
 * Determina se a vitória de um candidato já está matematicamente garantida,
 * mesmo que a apuração não tenha terminado — nunca uma projeção estatística,
 * só o pior caso matemático dado um teto real de votos que ainda podem
 * aparecer (ver `maxRemainingVotes` em `ClinchInput`).
 *
 * Isso NÃO é uma proclamação oficial de eleito — essa é sempre um ato da
 * Justiça Eleitoral, depois da totalização e homologação. É só uma
 * referência de que o resultado já está matematicamente decidido (ver o
 * texto usado na UI: "Eleito matematicamente (não oficial)").
 *
 * Duas regras, dependendo da corrida:
 *
 * 1. Maioria absoluta (Presidente/Governador no 1º turno — só 1 vaga, exige
 *    mais de 50% dos votos válidos): o líder já venceu se, mesmo supondo que
 *    NENHUM dos votos restantes seja dele (o pior caso possível para ele),
 *    ele ainda ficaria acima de 50% do total final de votos válidos.
 *
 * 2. Maioria simples com N vagas (2º turno — sempre 2 candidatos, 1 vaga;
 *    Senador, se um dia for ativado — N vagas): um candidato entre os N
 *    primeiros está garantido se, mesmo que TODOS os votos restantes fossem
 *    para o (N+1)-ésimo colocado atual (o pior caso possível — o candidato
 *    mais forte que ainda não está entre os vencedores), ele continuaria à
 *    frente. Reordenação só DENTRO dos N primeiros não muda quem vence, por
 *    isso só o corte N/N+1 importa.
 *
 * `maxRemainingVotes` deve vir de um teto real (ex.: eleitorado total menos o
 * já contabilizado nas seções totalizadas — ver `tseDataProvider.ts`), nunca
 * de uma estimativa. Um `maxRemainingVotes` negativo (dado inconsistente)
 * nunca declara ninguém eleito — por segurança, não por regra matemática.
 */
export interface ClinchInput {
  /** Votos de cada candidato na corrida, em qualquer ordem. */
  votes: number[];
  /** Total de votos válidos já apurados — base para a maioria absoluta. */
  totalValid: number;
  /** Teto de votos que ainda podem aparecer, no pior caso. */
  maxRemainingVotes: number;
  /** Quantas vagas estão em disputa nesta corrida. */
  seats: number;
  /** `true` para corridas que exigem maioria absoluta dos votos válidos. */
  requiresAbsoluteMajority: boolean;
}

/**
 * Devolve um array paralelo a `votes`: `true` no índice de cada candidato
 * cuja vitória já está matematicamente garantida.
 */
export function computeMathematicallyDecided(input: ClinchInput): boolean[] {
  const { votes, totalValid, maxRemainingVotes, seats, requiresAbsoluteMajority } = input;
  const decided = new Array<boolean>(votes.length).fill(false);
  if (maxRemainingVotes < 0 || seats < 1) return decided;

  const order = votes.map((_, i) => i).sort((a, b) => votes[b]! - votes[a]!);

  if (requiresAbsoluteMajority) {
    const leaderIdx = order[0];
    if (leaderIdx === undefined) return decided;
    const finalMaxValid = totalValid + maxRemainingVotes;
    if (votes[leaderIdx]! > finalMaxValid / 2) {
      decided[leaderIdx] = true;
    }
    return decided;
  }

  const cutoffIdx = order[seats];
  const cutoffVotes = cutoffIdx !== undefined ? votes[cutoffIdx]! : 0;
  for (let rank = 0; rank < Math.min(seats, order.length); rank++) {
    const idx = order[rank]!;
    if (votes[idx]! > cutoffVotes + maxRemainingVotes) {
      decided[idx] = true;
    }
  }
  return decided;
}
