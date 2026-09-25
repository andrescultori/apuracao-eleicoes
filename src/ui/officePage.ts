import { OFFICES } from '../data/domain';
import { computeResults, getScopeSections } from '../data/mockDataProvider';
import type { CandidateResult, OfficeKey } from '../data/types';
import type { AppContext } from '../state/appContext';
import { CandidateTable } from './candidateTable';
import { EvolutionChart, VoteChart } from './charts';
import { FavoritesSection } from './favorites';
import { FilterBar } from './filterBar';
import { SummaryCards, UpdateRow } from './summaryCards';

export function OfficePage(app: AppContext, office: OfficeKey): string {
  const cfg = OFFICES[office];
  const uf = app.officeUf(office);

  if (app.state.turn === 2 && !cfg.hasRunoff) {
    return (
      '<div class="stack">' +
      FilterBar(app, office, { search: false }) +
      '<div class="empty-state"><h3>Sem segundo turno</h3>' +
      `<p>O cargo de ${cfg.label.toLowerCase()} é decidido em turno único, portanto não há segundo turno para esta eleição.</p>` +
      '<button class="btn primary" data-action="set-turn" data-value="1">Ver 1º turno</button></div>' +
      '</div>'
    );
  }

  const results = app.getOfficeResults(office, uf, app.state.turn);
  const prevResults =
    app.state.dataMode === 'mock' && app.sim.tick > 0
      ? computeResults(office, uf, app.state.turn, app.sim.tick - 1, app.sim.history[app.sim.tick - 1]!.t)
      : null;
  const prevById: Record<string, CandidateResult> = {};
  if (prevResults)
    prevResults.candidates.forEach((c) => {
      prevById[c.id] = c;
    });

  const totalSections = getScopeSections(office, uf);
  const countedSections = app.state.dataMode === 'tse' ? 0 : Math.round(totalSections * app.sim.t);

  if (app.state.dataMode === 'tse' && results.providerStatus && results.providerStatus !== 'ready') {
    return (
      '<div class="stack">' +
      FilterBar(app, office) +
      '<div class="empty-state"><h3>Dados indisponíveis</h3>' +
      '<p>O modo de dados oficiais (TSE) está ativo, mas o endpoint exato ainda não foi configurado nesta implementação — ' +
      'ver "Sobre os dados" para detalhes e os links da documentação técnica oficial.</p>' +
      '<button class="btn primary" data-action="set-datamode" data-value="mock">Voltar ao modo demonstração</button></div>' +
      '</div>'
    );
  }

  return (
    '<div class="stack">' +
    FilterBar(app, office) +
    SummaryCards(app, results, totalSections, countedSections) +
    UpdateRow(app) +
    FavoritesSection(app, office, app.state.turn, uf, results) +
    VoteChart(app, office, app.state.turn, uf, results) +
    `<div><div class="section-head"><h2>Resultados — ${cfg.label}${uf ? ' · ' + uf : ' · Brasil'}</h2><span class="muted">ordenado por votos</span></div>` +
    CandidateTable(app, office, app.state.turn, uf, results, prevById) +
    '</div>' +
    EvolutionChart(app, office, app.state.turn, uf) +
    '</div>'
  );
}
