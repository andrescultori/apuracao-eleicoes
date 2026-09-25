import type { OfficeKey, Turn } from './types';

/**
 * Parser do arquivo EA11 (catálogo "ele-c.json" — configuração de eleições).
 *
 * Campos confirmados via texto extraído da especificação oficial (ver nota de
 * fontes em tseConfig.ts): `dg` (data de geração), `hg` (hora), `idg`
 * (identificador de geração, usado também como ETag), `f` (fase: s|o),
 * `arq[]` (tipos de arquivo disponíveis e seus diretórios-base), `pl[]`
 * (pleitos), cada um com `e[]` (eleições): `cd` (código), `cdt2` (código do
 * 2º turno, quando houver), `sqele`, `nm` (nome), `t` (turno), `tp` (tipo),
 * `abr[]` (abrangências: `cd`, mais `mu[]`/`cp[]` quando aplicável).
 */

export interface Ea11Abrangencia {
  cd: string;
}

export interface Ea11Eleicao {
  cd: number;
  cdt2?: number;
  sqele?: number;
  nm: string;
  t: Turn;
  tp: number;
  abr: Ea11Abrangencia[];
}

export interface Ea11Pleito {
  cd: number;
  cdpr?: number;
  /** Ciclo da eleição (ex.: "ele2026"), usado para montar o diretório de dados. */
  c: string;
  dt: string;
  dtlim?: string;
  e: Ea11Eleicao[];
}

export interface Ea11Arquivo {
  tp: string;
  dir: string;
}

export interface Ea11Catalog {
  dg: string;
  hg: string;
  idg?: number;
  f: 's' | 'o';
  arq: Ea11Arquivo[];
  pl: Ea11Pleito[];
}

export class Ea11ParseError extends Error {}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * Valida e converte o JSON bruto do EA11 para `Ea11Catalog`. Lança
 * `Ea11ParseError` para qualquer formato inesperado — nunca aceita um payload
 * parcialmente reconhecido como se fosse um catálogo válido.
 */
export function parseEa11Catalog(raw: unknown): Ea11Catalog {
  if (!isRecord(raw) || !Array.isArray(raw['pl'])) {
    throw new Ea11ParseError('EA11: formato inesperado (campo "pl" ausente ou não é lista)');
  }
  const pl = raw['pl'].map((pleito): Ea11Pleito => {
    if (!isRecord(pleito) || !Array.isArray(pleito['e']) || typeof pleito['c'] !== 'string') {
      throw new Ea11ParseError('EA11: pleito com formato inesperado');
    }
    const e = pleito['e'].map((eleicao): Ea11Eleicao => {
      if (
        !isRecord(eleicao) ||
        typeof eleicao['cd'] !== 'number' ||
        typeof eleicao['t'] !== 'number' ||
        typeof eleicao['tp'] !== 'number' ||
        !Array.isArray(eleicao['abr'])
      ) {
        throw new Ea11ParseError('EA11: eleição com formato inesperado');
      }
      return {
        cd: eleicao['cd'],
        cdt2: typeof eleicao['cdt2'] === 'number' ? eleicao['cdt2'] : undefined,
        sqele: typeof eleicao['sqele'] === 'number' ? eleicao['sqele'] : undefined,
        nm: typeof eleicao['nm'] === 'string' ? eleicao['nm'] : '',
        t: eleicao['t'] as Turn,
        tp: eleicao['tp'],
        abr: eleicao['abr'].map((a): Ea11Abrangencia => {
          if (!isRecord(a) || typeof a['cd'] !== 'string') {
            throw new Ea11ParseError('EA11: abrangência com formato inesperado');
          }
          return { cd: a['cd'] };
        }),
      };
    });
    return {
      cd: typeof pleito['cd'] === 'number' ? pleito['cd'] : 0,
      cdpr: typeof pleito['cdpr'] === 'number' ? pleito['cdpr'] : undefined,
      c: pleito['c'],
      dt: typeof pleito['dt'] === 'string' ? pleito['dt'] : '',
      dtlim: typeof pleito['dtlim'] === 'string' ? pleito['dtlim'] : undefined,
      e,
    };
  });
  return {
    dg: typeof raw['dg'] === 'string' ? raw['dg'] : '',
    hg: typeof raw['hg'] === 'string' ? raw['hg'] : '',
    idg: typeof raw['idg'] === 'number' ? raw['idg'] : undefined,
    f: raw['f'] === 's' ? 's' : 'o',
    arq: Array.isArray(raw['arq'])
      ? raw['arq']
          .filter((a): a is Record<string, unknown> => isRecord(a))
          .map((a) => ({ tp: String(a['tp'] ?? ''), dir: String(a['dir'] ?? '') }))
      : [],
    pl,
  };
}

/**
 * Tipos de eleição (`tp`) confirmados via especificação oficial do EA11.
 * A eleição federal (Presidente, Senador, Deputado Federal) e a eleição
 * estadual (Governador, Deputado Estadual) são votadas juntas no mesmo pleito
 * geral, mas o TSE as trata como duas "eleições" (`e[]`) distintas dentro dele.
 */
export const TIPO_ELEICAO_ESTADUAL_ORDINARIA = 1;
export const TIPO_ELEICAO_FEDERAL_ORDINARIA = 8;

/**
 * A que `tp` de eleição pertence cada cargo. Mapeamento derivado da divisão
 * federal/estadual da legislação eleitoral brasileira (não é um código
 * TSE-específico inventado) combinada com os tipos `tp` confirmados acima.
 */
export function tipoEleicaoForOffice(office: OfficeKey): number {
  if (office === 'presidente' || office === 'senador' || office === 'deputadoFederal') {
    return TIPO_ELEICAO_FEDERAL_ORDINARIA;
  }
  return TIPO_ELEICAO_ESTADUAL_ORDINARIA;
}

export interface ResolvedElection {
  ciclo: string;
  cdEleicao: number;
  /** Código de eleição do 2º turno, se este pleito tiver segundo turno. */
  cdEleicaoTurno2: number | null;
  abrangencia: Ea11Abrangencia | null;
}

/**
 * Localiza, no catálogo já carregado, a eleição correspondente a um cargo e
 * turno, restrita a uma UF quando o cargo não for de abrangência nacional.
 * Nunca usa um código fixo — sempre lê o catálogo publicado pelo TSE.
 */
export function resolveElection(
  catalog: Ea11Catalog,
  office: OfficeKey,
  turn: Turn,
  uf: string | null,
): ResolvedElection | null {
  const tipo = tipoEleicaoForOffice(office);
  for (const pleito of catalog.pl) {
    for (const eleicao of pleito.e) {
      if (eleicao.tp !== tipo) continue;
      if (turn === 1 && eleicao.t !== 1) continue;
      if (turn === 2 && eleicao.t !== 1 && eleicao.t !== 2) continue;
      const abrangencia = uf
        ? (eleicao.abr.find((a) => a.cd.toUpperCase() === uf.toUpperCase()) ?? null)
        : (eleicao.abr[0] ?? null);
      if (uf && !abrangencia) continue;
      return {
        ciclo: pleito.c,
        cdEleicao: eleicao.cd,
        cdEleicaoTurno2: eleicao.cdt2 ?? null,
        abrangencia,
      };
    }
  }
  return null;
}
