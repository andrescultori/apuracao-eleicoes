import { OFFICES } from '../data/domain';
import { computeResults } from '../data/mockDataProvider';
import type { CandidateResult, OfficeKey, ProviderStatus } from '../data/types';
import type { AppContext } from '../state/appContext';
import { BrazilMap, supportsMap } from './brazilMap';
import { CandidateTable } from './candidateTable';
import { EvolutionChart, VoteChart } from './charts';
import { FavoritesSection } from './favorites';
import { FilterBar } from './filterBar';
import { SummaryCards, UpdateRow } from './summaryCards';

const TSE_STATUS_EMPTY_STATE_MESSAGE: Record<Exclude<ProviderStatus, 'ready'>, string> = {
  loading: 'Buscando e verificando os dados desta eleição no TSE — isso pode levar alguns segundos.',
  error:
    'Não foi possível obter ou verificar os dados desta eleição no TSE agora. Os dados só são exibidos depois que a assinatura do arquivo é confirmada — nunca um resultado não verificado.',
  unconfigured: 'Esta eleição ainda não está disponível no catálogo publicado pelo TSE.',
};

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

  // No modo TSE, o percentual de seções totalizadas vem pronto do arquivo de
  // acompanhamento (EA14/EA15, campo `pstn` — já calculado pelo TSE, nunca
  // recalculado por `sectionsCounted / sectionsTotal`, que diverge do
  // oficial — ver nota em `ElectionResults.sectionsPercent`). Enquanto o
  // arquivo ainda não chegou, fica `undefined` e a UI mostra "—", nunca um 0%
  // enganoso como se a apuração não tivesse começado. No modo demonstração,
  // sem um "oficial" para seguir, o percentual é mesmo calculado a partir da
  // simulação.
  const sectionsPercent = app.state.dataMode === 'tse' ? (results.sectionsPercent ?? null) : app.sim.t * 100;

  if (app.state.dataMode === 'tse' && results.providerStatus && results.providerStatus !== 'ready') {
    const message = TSE_STATUS_EMPTY_STATE_MESSAGE[results.providerStatus];
    return (
      '<div class="stack">' +
      FilterBar(app, office) +
      '<div class="empty-state"><h3>Dados indisponíveis</h3>' +
      `<p>${message} Ver "Sobre os dados" para detalhes técnicos.</p>` +
      '<button class="btn primary" data-action="set-datamode" data-value="mock">Voltar ao modo demonstração</button></div>' +
      '</div>'
    );
  }

  return (
    '<div class="stack">' +
    FilterBar(app, office) +
    SummaryCards(results, sectionsPercent) +
    UpdateRow(app) +
    FavoritesSection(app, office, app.state.turn, uf, results) +
    VoteChart(app, office, app.state.turn, uf, results) +
    `<div><div class="section-head"><h2>Resultados — ${cfg.label}${uf ? ' · ' + uf : ' · Brasil'}</h2><span class="muted">ordenado por votos</span></div>` +
    CandidateTable(app, office, app.state.turn, uf, results, prevById) +
    '</div>' +
    EvolutionChart(app, office, app.state.turn, uf) +
    (supportsMap(office) ? BrazilMap(app, office, app.state.turn) : '') +
    '</div>'
  );
}
