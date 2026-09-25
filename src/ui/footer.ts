const REPO_URL = 'https://github.com/andrescultori/apuracao-eleicoes';

export function Footer(): string {
  return (
    '<footer><div class="shell footer-inner">' +
    '<div class="footer-top"><strong>Apuração 2026</strong><span>Versão 0.1.0</span></div>' +
    '<p>Aplicativo independente para visualização de dados eleitorais. Não representa o TSE nem qualquer órgão oficial.</p>' +
    '<p>Fonte dos dados oficiais (integração futura): Tribunal Superior Eleitoral.</p>' +
    '<div class="footer-credit">Desenvolvido por <a href="https://github.com/andrescultori" target="_blank" rel="noopener">André Scultori</a> · © 2026 · ' +
    `<a href="${REPO_URL}" target="_blank" rel="noopener">GitHub</a></div>` +
    '</div></footer>'
  );
}
