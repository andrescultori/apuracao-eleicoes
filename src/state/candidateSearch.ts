import { OFFICES, OFFICE_ORDER, UFS } from '../data/domain';
import type { CandidateResult, OfficeKey } from '../data/types';
import type { AppContext } from './appContext';

export interface CandidateSearchHit {
  office: OfficeKey;
  uf: string | null;
  candidate: CandidateResult;
}

const MAX_RESULTS = 25;

/**
 * Busca candidatos por nome ou número em todos os cargos e, para cargos de
 * abrangência estadual, em todas as UFs — não só no cargo/UF atualmente
 * selecionado nos filtros. Usada pelo módulo de Candidatos Favoritos, para
 * favoritar um candidato sem precisar navegar até a corrida dele primeiro.
 * Respeita o turno selecionado (`state.turn`), como o resto do app.
 */
export function searchAllCandidates(app: AppContext, rawQuery: string): CandidateSearchHit[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];
  const turn = app.state.turn;
  const hits: CandidateSearchHit[] = [];

  for (const office of OFFICE_ORDER) {
    const cfg = OFFICES[office];
    if (turn === 2 && !cfg.hasRunoff) continue;
    const ufList = cfg.scope === 'national' ? [null] : UFS.map((u) => u.sigla);
    for (const uf of ufList) {
      const results = app.getOfficeResults(office, uf, turn);
      for (const candidate of results.candidates) {
        if (matches(candidate, q)) {
          hits.push({ office, uf, candidate });
          if (hits.length >= MAX_RESULTS) return hits;
        }
      }
    }
  }
  return hits;
}

function matches(c: CandidateResult, q: string): boolean {
  return c.name.toLowerCase().includes(q) || c.ballotName.toLowerCase().includes(q) || c.number.includes(q);
}
