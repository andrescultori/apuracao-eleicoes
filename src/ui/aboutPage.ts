import { statusForT } from '../data/mockDataProvider';
import { TSE_CONFIG } from '../data/tseConfig';
import type { ProviderStatus } from '../data/types';
import type { AppContext } from '../state/appContext';
import { lastUpdateClock, timeAgoLabel } from '../state/appContext';

const TSE_STATUS_LABEL: Record<ProviderStatus, string> = {
  ready: 'Dados obtidos e com assinatura verificada',
  loading: 'Buscando e verificando dados...',
  error: 'Dados indisponíveis (falha ao obter ou verificar)',
  unconfigured: 'Dados indisponíveis (eleição não publicada no catálogo do TSE)',
};

export function AboutPage(app: AppContext): string {
  const status = statusForT(app.sim.t);
  const tseStatus = app.electionDataStatus();
  const modeLabel =
    app.state.dataMode === 'tse' ? 'Dados oficiais (TSE) — ver nota técnica abaixo' : 'Dados fictícios de demonstração';
  const tseLastUpdate = app.state.dataMode === 'tse' ? app.tseProvider.getLastUpdate() : null;
  return (
    '<div class="prose">' +
    '<h2>Fonte dos resultados</h2>' +
    '<p>Os resultados oficiais são provenientes dos arquivos de divulgação de resultados do Tribunal Superior Eleitoral (TSE). Em "Configurações" é possível alternar entre o modo demonstração (dados fictícios) e o modo dados oficiais.</p>' +
    '<h2>Sobre este aplicativo</h2>' +
    '<p>O Apuração 2026 é uma interface independente de visualização de dados eleitorais. Ele não altera os dados recebidos e a frequência de atualização depende da disponibilidade da fonte oficial. O aplicativo não realiza análise política, previsão eleitoral nem recomendação de voto — apenas apresenta dados. Em "Configurações" também é possível escolher a base do percentual de cada candidato: sobre votos válidos (excluindo brancos e nulos, convenção usual de apuração no Brasil) ou sobre votos totais apurados.</p>' +
    '<h2>Ficha técnica</h2>' +
    '<dl class="kv">' +
    `<dt>Última atualização dos dados</dt><dd class="num">${
      app.state.dataMode === 'tse'
        ? tseLastUpdate
          ? timeAgoLabel(tseLastUpdate)
          : '—'
        : lastUpdateClock(app) + ' (simulado)'
    }</dd>` +
    `<dt>Situação da apuração</dt><dd>${app.state.dataMode === 'tse' ? TSE_STATUS_LABEL[tseStatus] : status.label}</dd>` +
    `<dt>Fonte ativa</dt><dd>${modeLabel}</dd>` +
    '<dt>Versão do modelo de dados</dt><dd>0.1.0</dd>' +
    '</dl>' +
    '<h2>Integração com o TSE — nota técnica</h2>' +
    '<p>Confirmado ao vivo durante as janelas de simulado do TSE (setembro de 2026):</p>' +
    '<dl class="kv">' +
    '<dt>Ambiente oficial</dt><dd class="num">resultados.tse.jus.br/oficial</dd>' +
    '<dt>Ambiente simulado</dt><dd class="num">resultados-sim.tse.jus.br/simulado/simulado2026</dd>' +
    '<dt>Simulados agendados</dt><dd>15–17/set, 22–24/set e 28–29/set de 2026</dd>' +
    '<dt>Limite de requisições</dt><dd>100 por IP por segundo (excedentes: bloqueio de 10 min)</dd>' +
    '<dt>Assinatura dos arquivos</dt><dd>JWS (EdDSA/Ed25519), verificada no navegador antes de qualquer dado ser exibido</dd>' +
    '<dt>Seções totalizadas</dt><dd>Arquivo de acompanhamento do TSE (EA14/EA15), verificado da mesma forma</dd>' +
    '</dl>' +
    '<h2>Mapa por estado</h2>' +
    '<p>Disponível para Presidente e Governador (os únicos cargos de 1 vaga com regra de vitória simples o bastante para a cor do mapa significar uma coisa só). Não é uma silhueta geográfica real: é um cartograma esquemático (posições relativas de cada UF, sem dado geográfico nenhum). A cor de cada estado é do partido do candidato na frente ali; só fica na cor escura quando a vitória naquele estado já está matematicamente garantida, nunca uma projeção. Para Governador, cada UF já é uma eleição própria no TSE — o mapa busca as 27 de uma vez. Para Presidente, o mapa busca o resultado de cada UF separadamente; isso depende do TSE publicar um arquivo de resultado por UF para um cargo nacional, o que ainda não foi confirmado ao vivo (só o agregado Brasil e, em outros cargos, o nível de município foram observados) — se esse arquivo não existir, os estados aparecem como "sem dados", sem travar o restante do aplicativo.</p>' +
    '<p>O aplicativo busca os arquivos de divulgação de resultados diretamente do navegador (sem servidor intermediário) e verifica a assinatura digital de cada arquivo antes de exibir qualquer dado — um arquivo com assinatura inválida, de outro ambiente, ou ainda não publicado nunca é mostrado como resultado oficial. O acesso direto do navegador ao domínio do TSE foi confirmado ao vivo, sem bloqueio de CORS. A disponibilidade dos dados depende da janela de divulgação vigente (simulados agendados, ou o pleito oficial a partir de 04/10/2026). Consulte a ' +
    `<a href="${TSE_CONFIG.specUrl}" target="_blank" rel="noopener">página oficial de informações técnicas</a> e o <a href="${TSE_CONFIG.jwsManualUrl}" target="_blank" rel="noopener">manual de verificação de assinatura JWS</a> para mais detalhes.</p>` +
    `<div class="notice">Os resultados apresentados são parciais enquanto a totalização não estiver concluída. ${
      app.state.dataMode === 'mock'
        ? 'Este ambiente utiliza dados fictícios para demonstração da interface.'
        : TSE_STATUS_LABEL[tseStatus]
    }</div>` +
    '</div>'
  );
}
