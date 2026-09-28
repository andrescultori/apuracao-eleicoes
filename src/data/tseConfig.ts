import type { OfficeKey } from './types';

/**
 * Configuração da integração real com a divulgação de resultados do TSE.
 *
 * FONTES E METODOLOGIA:
 * o domínio `tse.jus.br` estava bloqueado pela política de rede do ambiente de
 * desenvolvimento original (25/09/2026), então a pesquisa inicial usou fontes
 * secundárias (PDFs extraídos, amostras publicadas em repositórios GitHub).
 * Em 28/09/2026 — dentro da janela oficial de simulado de 28–29/set —, uma
 * sessão do Claude com acesso real ao navegador (Claude in Chrome) navegou
 * manualmente pelo app oficial do simulado (`resultados-sim.tse.jus.br`) e
 * confirmou ao vivo os pontos abaixo marcados [OBSERVADO], lendo
 * `performance.getEntriesByType('resource')` e abrindo os arquivos que o
 * próprio app já havia carregado — nunca adivinhando uma URL. [DOC] marca
 * fatos publicados pelo TSE mas não vistos ao vivo (ex.: produção, que só abre
 * com o pleito 3220 em 04/10/2026 e ainda não tem candidatos definidos).
 *
 * CONFIRMADO:
 *   [OBSERVADO] Base do simulado 2026: `https://resultados-sim.tse.jus.br/simulado/simulado2026`
 *     (a raiz `/simulado` sozinha responde "Access Denied" da Akamai; o app
 *     mora em `/simulado/simulado2026/app/index.html` e todos os arquivos de
 *     dados saem desse mesmo prefixo).
 *   [DOC, inferido por simetria — NÃO observado ao vivo] Base oficial:
 *     `https://resultados.tse.jus.br/oficial`. Confirmar assim que a produção
 *     abrir (pleito 3220, 04/10/2026).
 *   NÃO usar `https://cdn.tse.jus.br` — não é a URL publicada pelo TSE (403).
 *   [OBSERVADO] Catálogo de eleições: `<base>/comum/config/ele-c.jws`.
 *   [OBSERVADO] Diretório por eleição: `<base>/<cdEleicao>/dados/<abrangencia>/`
 *     (abrangencia = "br", sigla de UF em minúsculas, ou UF+município) — SEM
 *     segmento de "ciclo" entre a base e o código de eleição, ao contrário do
 *     que se supunha antes.
 *   [OBSERVADO] Nome de arquivo: `<abrangencia>-c<cargo 4 díg>-e<eleição 6 díg>-u.jws`
 *     (resultado unificado) — ex.: `br-c0001-e021270-u.jws`,
 *     `sp61581-c0003-e021272-u.jws`. `-e.jws` no lugar de `-u.jws` = eleitos.
 *     Config de municípios: `<cdEleicao>/config/mun-e<eleição 6 díg>-cm.jws`.
 *   [DOC — PDF "Instruções para download", seção 5] Códigos de cargo (`c` no
 *     nome do arquivo): Presidente 0001, Governador 0003, Senador 0005,
 *     Deputado Federal 0006, Deputado Estadual 0007, Deputado Distrital 0008,
 *     Prefeito 0011, Vereador 0013.
 *   [OBSERVADO] O app consome `.jws` (envelope assinado); o mesmo arquivo
 *     também existe em `.json` puro (sem assinatura), mas este módulo sempre
 *     busca `.jws`, porque é o único que dá para verificar (ver jws.ts).
 *   [OBSERVADO] Código de eleição (`ele`) É POR TIPO DE ELEIÇÃO, não fixo por
 *     cargo — no simulado, `21270` = "Ordinária Federal" (só Presidente) e
 *     `21272` = "Ordinária Estadual" (Governador, Senador, Dep. Federal,
 *     Dep. Estadual, Dep. Distrital juntos). Os códigos citados para a eleição
 *     real de 2026 (6257/6259/6261) NÃO valem no simulado e podem mudar até
 *     lá — por isso nunca hardcodar: sempre ler do `ele-c.jws` (ver ea11.ts).
 *   Limite de acesso: 100 requisições por IP por segundo (um 304 também
 *     conta); excedentes geram bloqueio de 10 min, renovado a cada nova
 *     tentativa durante o bloqueio. Muitos 404 seguidos também podem bloquear
 *     o IP — por isso o fluxo é sempre `ele-c` → `mun-…-cm` → arquivo de
 *     resultado, nunca uma URL adivinhada.
 *   Cache HTTP: ETag == idg (identificador de geração) do recurso; um GET com
 *     If-None-Match devolve 304 sem corpo.
 *   Janela de simulado 2026: 15–17/set, 22–24/set e 28–29/set (esta última,
 *     28–29/set, das 15h–17h de Brasília — os dados evoluem ao longo dela).
 *
 * NÃO CONFIRMADO:
 *   - A chave pública real (JWK) para verificar a assinatura EdDSA dos
 *     arquivos `.jws` — ver a nota completa em jws.ts. Sem ela, nenhum dado é
 *     promovido a "ready" mesmo com o arquivo já em mãos.
 *   - O padrão de base/URL em produção (`oficial`) — só inferido por simetria
 *     com o simulado, nunca visto ao vivo (produção ainda não tem candidatos).
 *   - Autenticação: nenhuma fonte consultada menciona exigência de API
 *     key/token; os exemplos observados fazem GET simples.
 */

export type TseEnvKey = 'oficial' | 'simulado';

export type TseFileCode = 'EA10' | 'EA11' | 'EA12' | 'EA14' | 'EA15' | 'EA16' | 'EA18' | 'EA20';

export interface TseHostConfig {
  /** Prefixo completo de onde saem todos os arquivos deste ambiente — já inclui o "ambiente" e, quando existir, o segmento de ciclo (ex.: "simulado2026"). */
  base: string;
}

export const TSE_HOSTS: Record<TseEnvKey, TseHostConfig> = {
  // [DOC, inferido por simetria — ver nota de fontes acima] não observado ao vivo.
  oficial: { base: 'https://resultados.tse.jus.br/oficial' },
  // [OBSERVADO em 28/09/2026] confirmado ao vivo durante a janela de simulado.
  simulado: { base: 'https://resultados-sim.tse.jus.br/simulado/simulado2026' },
};

export const TSE_CONFIG = {
  hosts: TSE_HOSTS,

  files: {
    EA10: 'resultado de eleitos',
    EA11: 'configuração de eleições',
    EA12: 'configuração de municípios',
    EA14: 'acompanhamento Brasil',
    EA15: 'acompanhamento UF',
    EA16: 'configuração de seções eleitorais',
    EA18: 'auxiliar de seção',
    EA20: 'resultado unificado',
  } satisfies Record<TseFileCode, string>,

  maxRequestsPerSecond: 100,

  specUrl: 'https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados',

  /** [OBSERVADO] Manual de verificação dos arquivos JWS — ver jws.ts. */
  jwsManualUrl:
    'https://www.tse.jus.br/eleicoes/eleicoes-2026-content/arquivos/divulgacao-de-resultados/manual-verificacao-jws',

  /** [OBSERVADO] Catálogo de eleições (EA11), sempre em `.jws`. */
  ea11Url(env: TseEnvKey): string {
    return `${TSE_HOSTS[env].base}/comum/config/ele-c.jws`;
  },

  /** [OBSERVADO] `<base>/<cdEleicao>/dados/<abrangencia>` — sem segmento de ciclo. */
  electionDir(env: TseEnvKey, cdEleicao: number, uf: string | null): string {
    const abr = uf ? uf.toLowerCase() : 'br';
    return `${TSE_HOSTS[env].base}/${cdEleicao}/dados/${abr}`;
  },

  /**
   * [DOC — PDF "Instruções para download", seção 5] Códigos de cargo do TSE.
   * Usados no nome do arquivo (`-c<CCCC>-`), zero-preenchidos a 4 dígitos.
   */
  officeCargoCode: {
    presidente: 1,
    governador: 3,
    senador: 5,
    deputadoFederal: 6,
    deputadoEstadual: 7,
  } satisfies Record<OfficeKey, number>,

  /** [OBSERVADO] `<abrangencia>-c<cargo 4 díg>-e<eleição 6 díg>-<u|e>.jws`. */
  buildResultPath(
    fileCode: 'EA10' | 'EA20',
    env: TseEnvKey,
    params: { office: OfficeKey; uf: string | null; cdEleicao: number },
  ): string {
    const cargo = padCode(TSE_CONFIG.officeCargoCode[params.office], 4);
    const abr = params.uf ? params.uf.toLowerCase() : 'br';
    const dir = TSE_CONFIG.electionDir(env, params.cdEleicao, params.uf);
    const suffix = fileCode === 'EA10' ? 'e' : 'u';
    return `${dir}/${abr}-c${cargo}-e${padCode(params.cdEleicao, 6)}-${suffix}.jws`;
  },

  /**
   * EA14 (Brasil) / EA15 (UF) — "acompanhamento" — não dependem do código de
   * cargo, apenas do código de eleição já resolvido.
   */
  buildAccompanimentPath(env: TseEnvKey, params: { uf: string | null; cdEleicao: number }): string {
    const abr = params.uf ? params.uf.toLowerCase() : 'br';
    const dir = TSE_CONFIG.electionDir(env, params.cdEleicao, params.uf);
    return `${dir}/${abr}-e${padCode(params.cdEleicao, 6)}-ab.jws`;
  },
};

/** Preenche um código numérico com zeros à esquerda até `width` dígitos. */
export function padCode(code: number, width: number): string {
  return String(code).padStart(width, '0');
}
