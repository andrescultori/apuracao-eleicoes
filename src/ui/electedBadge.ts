/**
 * Selo de "eleito matematicamente" (ver `electionMath.ts`/`AppContext.
 * applyElectionCertainty`) — centralizado aqui pra aparecer de forma
 * consistente em toda tela que lista candidatos (tabela, gráfico de barras,
 * mapa, visão geral, favoritos), não só na tabela de resultados.
 */
const ELECTED_TITLE =
  'Eleito matematicamente (não oficial): resultado matematicamente decidido mesmo com a apuração em andamento — não é uma proclamação oficial da Justiça Eleitoral.';

/** Bloco de texto completo — usado onde há espaço de sobra (tabela de candidatos, cards de favoritos). */
export function ElectedBadgeBlock(): string {
  return `<span class="elected-badge" title="${ELECTED_TITLE}">Eleito matematicamente (não oficial)</span>`;
}

/** Selo compacto — usado onde o espaço é apertado (gráfico de barras, cards da visão geral, chips de favoritos). */
export function ElectedBadgeCompact(): string {
  return `<span class="elected-badge-compact" title="${ELECTED_TITLE}">✓ Eleito</span>`;
}

/** Como `ELECTED_TITLE`, mas pra vaga de 2º turno garantida (ver `confirmedRunoff` em appContext.ts) — nunca junto com o selo de eleito, só um ou outro. */
const RUNOFF_TITLE =
  'Confirmado no 2º turno (não oficial): vaga entre os 2 primeiros já matematicamente garantida, mesmo com a apuração em andamento — não é uma proclamação oficial da Justiça Eleitoral.';

/** Bloco de texto completo — mesmo uso de `ElectedBadgeBlock`. */
export function RunoffBadgeBlock(): string {
  return `<span class="elected-badge runoff" title="${RUNOFF_TITLE}">Confirmado no 2º turno (não oficial)</span>`;
}

/** Selo compacto — mesmo uso de `ElectedBadgeCompact`. */
export function RunoffBadgeCompact(): string {
  return `<span class="elected-badge-compact runoff" title="${RUNOFF_TITLE}">✓ 2º turno</span>`;
}
