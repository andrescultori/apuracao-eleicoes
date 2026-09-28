import type { Ea11Catalog } from './ea11';
import type { OfficeKey } from './types';

/**
 * Configuração da integração real com a divulgação de resultados do TSE.
 *
 * FONTES E METODOLOGIA:
 * o domínio `tse.jus.br` estava bloqueado pela política de rede do ambiente de
 * desenvolvimento original (25/09/2026), então a pesquisa inicial usou fontes
 * secundárias (PDFs extraídos, amostras publicadas em repositórios GitHub).
 * Em 28-29/09/2026 — dentro da janela oficial de simulado —, sessões com
 * acesso real ao navegador (Claude in Chrome) e um catálogo real obtido via
 * `curl` confirmaram ao vivo os pontos abaixo marcados [OBSERVADO].
 *
 * CONFIRMADO:
 *   [OBSERVADO] Base do simulado 2026: `https://resultados-sim.tse.jus.br/simulado/simulado2026`
 *     (a raiz `/simulado` sozinha responde "Access Denied" da Akamai).
 *   [DOC, inferido por simetria — NÃO observado ao vivo] Base oficial:
 *     `https://resultados.tse.jus.br/oficial`. Confirmar assim que a produção
 *     abrir (pleito 3220, 04/10/2026).
 *   NÃO usar `https://cdn.tse.jus.br` — não é a URL publicada pelo TSE (403).
 *   [OBSERVADO] Catálogo de eleições: `<base>/comum/config/ele-c.jws` — este
 *     caminho é fixo (é o ponto de entrada; não pode vir do próprio catálogo).
 *   [OBSERVADO] O catálogo publica, em `arq[]`, o TEMPLATE de diretório de
 *     cada tipo de arquivo, com placeholders literais: `<base>`, `<ambiente>`,
 *     `<ciclo>`, `<cd_eleicao>`, `<uf>`, `<cd_pleito>`, `<municipio>`, `<zona>`,
 *     `<secao>`. Em vez de fixar o formato do caminho no código (o que já nos
 *     levou a um bug — um "SEM segmento de ciclo" incorreto que chegou a ficar
 *     neste arquivo), `buildResultPath`/`buildAccompanimentPath` LEEM esse
 *     template do catálogo já carregado e só substituem os placeholders que
 *     sabemos preencher com segurança (`<ciclo>` = `pl.c`, `<cd_eleicao>`,
 *     `<uf>`). `<base>` e `<ambiente>` ficam juntos, já embutidos em
 *     `TSE_HOSTS[env].base` (ver nota abaixo) — essa é a única aproximação que
 *     ainda não é 100% derivada do catálogo, documentada explicitamente.
 *   [OBSERVADO] Exemplo real (tipo "u", Presidente/Brasil):
 *     `.../simulado2026/ele2026/21270/dados/br/br-c0001-e021270-u.jws`. O
 *     segmento `ele2026` é `pl.c` do catálogo — CONFIRMADO que existe (uma
 *     versão anterior deste comentário afirmava o contrário; era um erro).
 *   [OBSERVADO] Nome de arquivo: `<abrangencia>-c<cargo 4 díg>-e<eleição 6 díg>-u.jws`
 *     (resultado unificado, tipo de arquivo "u") — ex.: `br-c0001-e021270-u.jws`,
 *     `sp61581-c0003-e021272-u.jws` (nível município, observado; nível UF
 *     sozinho — ex. `sp-c0003-e021272-u.jws` — é [DOC, não observado ao vivo]).
 *     Tipo "e" (mesmo template de diretório) = resultado de eleitos.
 *   [DOC — PDF "Instruções para download", seção 5] Códigos de cargo (`c` no
 *     nome do arquivo, mesmo valor de `cp[].cd` no catálogo): Presidente 1,
 *     Governador 3, Senador 5, Deputado Federal 6, Deputado Estadual 7,
 *     Deputado Distrital 8, Prefeito 11, Vereador 13.
 *   [OBSERVADO] O corpo do arquivo é um JWS em compact serialization (texto,
 *     não JSON), mesmo com `Content-Type: application/json`. O mesmo arquivo
 *     também existe em `.json` puro (sem assinatura), mas este módulo sempre
 *     busca `.jws`, porque é o único que dá para verificar (ver jws.ts).
 *   [OBSERVADO] Código de eleição (`ele`) é por TIPO de eleição, não fixo por
 *     cargo — no simulado, `21270` = "Ordinária Federal" (só Presidente) e
 *     `21272` = "Ordinária Estadual" (Governador, Senador, Dep. Federal,
 *     Dep. Estadual, Dep. Distrital juntos, para as 27 UFs). Nunca hardcodar:
 *     sempre ler do catálogo (ver ea11.ts, `resolveElection`).
 *   Limite de acesso: 100 requisições por IP por segundo (um 304 também
 *     conta); excedentes geram bloqueio de 10 min, renovado a cada nova
 *     tentativa durante o bloqueio. Muitos 404 seguidos também podem bloquear
 *     o IP — por isso o fluxo é sempre `ele-c` → arquivo de resultado, nunca
 *     uma URL adivinhada.
 *   Cache HTTP: ETag == idg (identificador de geração) do recurso; um GET com
 *     If-None-Match devolve 304 sem corpo. Não usamos `?nocache=` (o app
 *     oficial usa, mas isso anula o benefício do cache por ETag).
 *
 * NÃO CONFIRMADO:
 *   - O padrão de base/URL em produção (`oficial`) — só inferido por simetria
 *     com o simulado, nunca visto ao vivo (produção ainda não tem candidatos).
 *   - Nível UF isolado (sem município) para o arquivo de resultado — só o
 *     nível município foi observado ao vivo.
 *   - Autenticação: nenhuma fonte consultada menciona exigência de API
 *     key/token; os exemplos observados fazem GET simples.
 */

export type TseEnvKey = 'oficial' | 'simulado';

export type TseFileCode = 'EA10' | 'EA11' | 'EA12' | 'EA14' | 'EA15' | 'EA16' | 'EA18' | 'EA20';

export interface TseHostConfig {
  /**
   * Prefixo de onde saem todos os arquivos deste ambiente. Já inclui o
   * "ambiente" (e, no caso do simulado, um segmento extra de ciclo do
   * ambiente — "simulado2026" — confirmado ao vivo) — ver nota de fontes
   * acima sobre por que `<base>`/`<ambiente>` do template não são separados
   * na prática desta implementação.
   */
  base: string;
}

export const TSE_HOSTS: Record<TseEnvKey, TseHostConfig> = {
  // [DOC, inferido por simetria — ver nota de fontes acima] não observado ao vivo.
  oficial: { base: 'https://resultados.tse.jus.br/oficial' },
  // [OBSERVADO em 28-29/09/2026] confirmado ao vivo durante a janela de simulado.
  simulado: { base: 'https://resultados-sim.tse.jus.br/simulado/simulado2026' },
};

/** Preenche um código numérico com zeros à esquerda até `width` dígitos. */
export function padCode(code: number, width: number): string {
  return String(code).padStart(width, '0');
}

/**
 * Localiza, em `arq[]`, o template de diretório para um tipo de arquivo (ex.:
 * "u" = resultado unificado, "e" = resultado de eleitos). Devolve `null`
 * quando o catálogo não lista esse tipo — nesse caso o chamador nunca deve
 * inventar um caminho.
 */
function findArqTemplate(catalog: Ea11Catalog, arqTipo: string): string | null {
  return catalog.arq.find((a) => a.tp === arqTipo)?.dir ?? null;
}

/**
 * Substitui os placeholders do template de diretório publicado pelo catálogo.
 * `<ambiente>` é tratado como vazio (já embutido em `base` — ver
 * `TseHostConfig.base`); barras duplicadas resultantes disso são colapsadas
 * (preservando o `://` do protocolo). Placeholders que não usamos
 * (`<cd_pleito>`, `<municipio>`, `<zona>`, `<secao>` — auxiliar de seção,
 * fora do escopo deste app) não são substituídos.
 */
function fillDirTemplate(
  template: string,
  params: { base: string; ciclo: string; cdEleicao: number; uf: string | null },
): string {
  const abr = params.uf ? params.uf.toLowerCase() : 'br';
  const filled = template
    .replace('<base>', params.base)
    .replace('<ambiente>', '')
    .replace('<ciclo>', params.ciclo)
    .replace('<cd_eleicao>', String(params.cdEleicao))
    .replace('<uf>', abr);
  return filled.replace(/([^:])\/{2,}/g, '$1/');
}

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

  /** [OBSERVADO] Manual de verificação dos arquivos JWS — ver jws.ts e tseKeys.ts. */
  jwsManualUrl:
    'https://www.tse.jus.br/eleicoes/eleicoes-2026-content/arquivos/divulgacao-de-resultados/manual-verificacao-jws',

  /** [OBSERVADO] Catálogo de eleições (EA11), sempre em `.jws`. Caminho fixo — é o ponto de entrada. */
  ea11Url(env: TseEnvKey): string {
    return `${TSE_HOSTS[env].base}/comum/config/ele-c.jws`;
  },

  /**
   * [DOC — PDF "Instruções para download", seção 5] Códigos de cargo do TSE,
   * confirmados também no catálogo real (`cp[].cd`). Usados no nome do
   * arquivo (`-c<CCCC>-`), zero-preenchidos a 4 dígitos.
   */
  officeCargoCode: {
    presidente: 1,
    governador: 3,
    senador: 5,
    deputadoFederal: 6,
    deputadoEstadual: 7,
  } satisfies Record<OfficeKey, number>,

  /**
   * Monta a URL do arquivo de resultado (EA20, tipo "u") ou de eleitos (EA10,
   * tipo "e"), lendo o template de diretório do catálogo já carregado — nunca
   * um caminho fixo. Devolve `null` quando o catálogo não lista esse tipo de
   * arquivo (nunca inventa o restante da URL nesse caso).
   */
  buildResultPath(
    fileCode: 'EA10' | 'EA20',
    env: TseEnvKey,
    catalog: Ea11Catalog,
    params: { office: OfficeKey; uf: string | null; ciclo: string; cdEleicao: number },
  ): string | null {
    const arqTipo = fileCode === 'EA10' ? 'e' : 'u';
    const template = findArqTemplate(catalog, arqTipo);
    if (!template) return null;
    const dir = fillDirTemplate(template, {
      base: TSE_HOSTS[env].base,
      ciclo: params.ciclo,
      cdEleicao: params.cdEleicao,
      uf: params.uf,
    });
    const cargo = padCode(TSE_CONFIG.officeCargoCode[params.office], 4);
    const abr = params.uf ? params.uf.toLowerCase() : 'br';
    return `${dir}/${abr}-c${cargo}-e${padCode(params.cdEleicao, 6)}-${arqTipo}.jws`;
  },

  /**
   * EA14 (Brasil) / EA15 (UF) — "acompanhamento", tipo de arquivo "ab" — não
   * dependem do código de cargo, apenas do código de eleição já resolvido.
   * Mesma lógica de template de `buildResultPath`.
   */
  buildAccompanimentPath(
    env: TseEnvKey,
    catalog: Ea11Catalog,
    params: { uf: string | null; ciclo: string; cdEleicao: number },
  ): string | null {
    const template = findArqTemplate(catalog, 'ab');
    if (!template) return null;
    const dir = fillDirTemplate(template, {
      base: TSE_HOSTS[env].base,
      ciclo: params.ciclo,
      cdEleicao: params.cdEleicao,
      uf: params.uf,
    });
    const abr = params.uf ? params.uf.toLowerCase() : 'br';
    return `${dir}/${abr}-e${padCode(params.cdEleicao, 6)}-ab.jws`;
  },
};
