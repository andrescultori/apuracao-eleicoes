import type { OfficeKey } from './types';

/**
 * Configuração da integração real com a divulgação de resultados do TSE.
 *
 * FONTES E METODOLOGIA (importante para quem for revisar/completar isto):
 * o domínio `tse.jus.br` (incluindo `www.tse.jus.br`, `resultados.tse.jus.br` e
 * `resultados-sim.tse.jus.br`) está bloqueado pela política de rede do ambiente
 * onde esta integração foi escrita (25/09/2026) — não foi possível abrir a
 * página oficial de informações técnicas nem as páginas de especificação de
 * cada arquivo diretamente. Os fatos abaixo foram obtidos por pesquisa cruzada
 * de fontes secundárias públicas e verificáveis:
 *   - texto extraído (pdftotext/OCR) dos PDFs oficiais de especificação EA10,
 *     EA11, EA12, EA14, EA15, EA16, EA18 e do "Instruções para download dos
 *     arquivos da Divulgação de resultados das Eleições 2026" (v1.0, 25/05/2026),
 *     encontrado no repositório público github.com/hugopaul/eleicoes-app;
 *   - amostras de JSON reais (simulado 2026 e oficial 2024) e um contrato de API
 *     de terceiros validado contra elas, no mesmo repositório
 *     (specs/001-backend-eleicoes-2026/spec.md);
 *   - dezenas de repositórios públicos no GitHub (2022–2026) que consomem esses
 *     arquivos em produção, confirmando o padrão de URL por convenção observada.
 * Antes de usar isto para uma eleição real, confirme diretamente na página
 * oficial (https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados)
 * a partir de um ambiente sem esse bloqueio de rede — em especial os pontos
 * marcados "NÃO CONFIRMADO" abaixo.
 *
 * CONFIRMADO:
 *   Ambiente oficial:    https://resultados.tse.jus.br              (diretório "oficial")
 *   Ambiente simulado:   https://resultados-sim.tse.jus.br/simulado (diretório "simulado")
 *   NÃO usar https://cdn.tse.jus.br — não é a URL publicada pelo TSE (responde 403).
 *   Simulados agendados para 2026: 15–17/set, 22–24/set e 28–29/set.
 *   Limite de acesso: 100 requisições por IP por segundo (um 304 também conta);
 *     excedentes geram bloqueio de 10 min, renovado a cada nova tentativa durante
 *     o bloqueio. Muitos 404 seguidos também podem bloquear o IP — por isso o
 *     código nunca deve "chutar" uma URL sem antes descobrir o código real pelo
 *     catálogo EA11 (ele-c.json).
 *   Códigos de eleição citados para 2026: federal 6257, estadual 6259, distrital
 *     6261; pleito 3220 (04/10/2026). Em 24–25/09/2026 esses códigos ainda não
 *     apareciam no catálogo EA11 real (apenas em comunicados do TSE) — por isso
 *     este módulo NÃO os usa diretamente; a resolução é sempre feita consultando
 *     o catálogo EA11 em tempo real (ver `ea11.ts`), nunca por um código fixo.
 *   Cache HTTP: ETag == idg (identificador de geração) do recurso; um GET com
 *     If-None-Match devolve 304 sem corpo.
 *   Autenticação: nenhuma fonte consultada menciona exigência de API key/token;
 *     todos os exemplos de código fazem GET simples. NÃO CONFIRMADO de forma
 *     explícita e documental.
 *
 * NÃO CONFIRMADO:
 *   - "Manual de verificação dos arquivos JWS": não foi localizado em nenhuma
 *     fonte consultada. O EA11 lista um arquivo tipo "a" = certificado digital
 *     (`cert-e<ELEICAO>-a.cer`), descrito como usado para "validação da
 *     assinatura dos arquivos gerados para a eleição" — mas o mecanismo exato
 *     (JWS? PKCS#7/CMS destacado? outro?) não pôde ser confirmado. Ver jws.ts.
 *   - Os códigos de cargo (`cd` de `carg[]`/EA20, ou o `-c<cargo>-` do nome do
 *     arquivo) para cada OfficeKey (Presidente, Governador, Senador, Deputado
 *     Federal, Deputado Estadual). Por isso `OFFICE_CARGO_CODE` abaixo está
 *     vazio — nunca inventar esses números.
 *   - Os hrefs exatos da página raiz de informações técnicas (a página não pôde
 *     ser aberta neste ambiente).
 */

export type TseEnvKey = 'oficial' | 'simulado';

export type TseFileCode = 'EA10' | 'EA11' | 'EA12' | 'EA14' | 'EA15' | 'EA16' | 'EA18' | 'EA20';

export interface TseHostConfig {
  base: string;
  /** Segmento de diretório de ambiente usado nas URLs (não o rótulo da UI). */
  dirSegment: string;
}

export const TSE_HOSTS: Record<TseEnvKey, TseHostConfig> = {
  oficial: { base: 'https://resultados.tse.jus.br', dirSegment: 'oficial' },
  simulado: { base: 'https://resultados-sim.tse.jus.br/simulado', dirSegment: 'simulado' },
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

  /**
   * URL fixa do catálogo de eleições (EA11), confirmada por múltiplas fontes
   * (ex.: https://resultados.tse.jus.br/oficial/comum/config/ele-c.json).
   */
  ea11Url(env: TseEnvKey): string {
    return `${TSE_HOSTS[env].base}/${TSE_HOSTS[env].dirSegment}/comum/config/ele-c.json`;
  },

  /**
   * Diretório-base por eleição, confirmado no padrão geral descrito pelo EA11:
   * `<base>/<ambiente>/<ciclo>/<cdEleicao>/dados/<uf>`.
   */
  electionDir(env: TseEnvKey, ciclo: string, cdEleicaoPadded: string, uf: string): string {
    return `${TSE_HOSTS[env].base}/${TSE_HOSTS[env].dirSegment}/${ciclo}/${cdEleicaoPadded}/dados/${uf.toLowerCase()}`;
  },

  /**
   * Códigos de cargo do TSE por OfficeKey. NÃO CONFIRMADO — ver nota no topo
   * deste arquivo. Deixar vazio até confirmar na especificação oficial do EA20
   * (não localizada nesta sessão) ou extrair dinamicamente de `carg[]` de um
   * EA20 já obtido para a mesma eleição.
   */
  officeCargoCode: {} as Partial<Record<OfficeKey, string>>,

  /**
   * TODO(tse-integracao): construir a URL de EA10/EA20 exige o código de cargo
   * (ver `officeCargoCode`, ainda não confirmado) além do código de eleição
   * (resolvido dinamicamente via `ea11.ts`, nunca fixo). Enquanto
   * `officeCargoCode[office]` estiver ausente, devolve `null` — o app trata
   * isso como "unconfigured" e nunca inventa o restante da URL.
   */
  buildResultPath(
    fileCode: 'EA10' | 'EA20',
    env: TseEnvKey,
    params: { office: OfficeKey; uf: string | null; ciclo: string; cdEleicaoPadded: string },
  ): string | null {
    const cargo = TSE_CONFIG.officeCargoCode[params.office];
    if (!cargo) return null;
    const abr = params.uf ? params.uf.toLowerCase() : 'br';
    const dir = TSE_CONFIG.electionDir(env, params.ciclo, params.cdEleicaoPadded, params.uf ?? 'br');
    const suffix = fileCode === 'EA10' ? 'e' : 'u';
    return `${dir}/${abr}-c${cargo}-e${params.cdEleicaoPadded}-${suffix}.json`;
  },

  /**
   * EA14 (Brasil) / EA15 (UF) — "acompanhamento" — não dependem do código de
   * cargo, apenas do código de eleição já resolvido. Diferente de EA10/EA20,
   * este path é construível de ponta a ponta com o que já confirmamos.
   */
  buildAccompanimentPath(
    env: TseEnvKey,
    params: { uf: string | null; ciclo: string; cdEleicaoPadded: string },
  ): string {
    const abr = params.uf ? params.uf.toLowerCase() : 'br';
    const dir = TSE_CONFIG.electionDir(env, params.ciclo, params.cdEleicaoPadded, params.uf ?? 'br');
    return `${dir}/${abr}-e${params.cdEleicaoPadded}-ab.json`;
  },
};

/** Preenche um código numérico com zeros à esquerda até `width` dígitos. */
export function padCode(code: number, width: number): string {
  return String(code).padStart(width, '0');
}
