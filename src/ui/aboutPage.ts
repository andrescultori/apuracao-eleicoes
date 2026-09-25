import { statusForT } from '../data/mockDataProvider';
import { TSE_CONFIG } from '../data/tseConfig';
import type { AppContext } from '../state/appContext';
import { lastUpdateClock } from '../state/appContext';

export function AboutPage(app: AppContext): string {
  const status = statusForT(app.sim.t);
  const modeLabel =
    app.state.dataMode === 'tse' ? 'Dados oficiais (TSE) — ver nota técnica abaixo' : 'Dados fictícios de demonstração';
  return (
    '<div class="prose">' +
    '<h2>Fonte dos resultados</h2>' +
    '<p>Os resultados oficiais são provenientes dos arquivos de divulgação de resultados do Tribunal Superior Eleitoral (TSE). Em "Configurações" é possível alternar entre o modo demonstração (dados fictícios) e o modo dados oficiais.</p>' +
    '<h2>Sobre este aplicativo</h2>' +
    '<p>O Apuração 2026 é uma interface independente de visualização de dados eleitorais. Ele não altera os dados recebidos e a frequência de atualização depende da disponibilidade da fonte oficial. O aplicativo não realiza análise política, previsão eleitoral nem recomendação de voto — apenas apresenta dados.</p>' +
    '<h2>Ficha técnica</h2>' +
    '<dl class="kv">' +
    `<dt>Última atualização dos dados</dt><dd class="num">${app.state.dataMode === 'tse' ? '—' : lastUpdateClock(app) + ' (simulado)'}</dd>` +
    `<dt>Situação da apuração</dt><dd>${app.state.dataMode === 'tse' ? 'Dados indisponíveis' : status.label}</dd>` +
    `<dt>Fonte ativa</dt><dd>${modeLabel}</dd>` +
    '<dt>Versão do modelo de dados</dt><dd>0.1.0</dd>' +
    '</dl>' +
    '<h2>Integração com o TSE — nota técnica</h2>' +
    '<p>Confirmado na documentação oficial do TSE (consultada em 25/09/2026):</p>' +
    '<dl class="kv">' +
    '<dt>Ambiente oficial</dt><dd class="num">resultados.tse.jus.br</dd>' +
    '<dt>Ambiente simulado</dt><dd class="num">resultados-sim.tse.jus.br/simulado</dd>' +
    '<dt>Simulados agendados</dt><dd>15–17/set, 22–24/set e 28–29/set de 2026</dd>' +
    '<dt>Limite de requisições</dt><dd>100 por IP por segundo (excedentes: bloqueio de 10 min)</dd>' +
    '<dt>Arquivos publicados</dt><dd>EA10, EA11, EA12, EA14, EA15, EA16, EA18, EA20</dd>' +
    '</dl>' +
    '<p>O padrão exato de URL/path e o schema de campos de cada arquivo (EA10–EA20) não foram confirmados nesta implementação — as páginas de especificação individuais e o manual de verificação de assinatura JWS não puderam ser lidos por completo. Por isso, o modo "Dados oficiais (TSE)" desta versão mostra "Dados indisponíveis" em vez de resultados inventados, mesmo quando selecionado. Consulte a ' +
    `<a href="${TSE_CONFIG.specUrl}" target="_blank" rel="noopener">página oficial de informações técnicas</a> antes de preencher <code>TSE_CONFIG.buildPath</code> no código-fonte.</p>` +
    `<div class="notice">Os resultados apresentados são parciais enquanto a totalização não estiver concluída. ${
      app.state.dataMode === 'mock'
        ? 'Este ambiente utiliza dados fictícios para demonstração da interface.'
        : 'O modo de dados oficiais está ativo, mas ainda sem endpoint configurado nesta versão.'
    }</div>` +
    '</div>'
  );
}
