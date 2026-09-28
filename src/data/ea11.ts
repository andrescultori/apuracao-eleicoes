import { TSE_CONFIG } from './tseConfig';
import type { OfficeKey, Turn } from './types';

/**
 * Parser do arquivo EA11 (catálogo "ele-c.jws" — configuração de eleições).
 *
 * CORRIGIDO em 29/09/2026 a partir de um catálogo real do simulado (gerado em
 * 14/09/2026, fornecido pelo usuário via `curl`/navegação real) — dois pontos
 * importantes que a versão anterior deste arquivo tinha errado:
 *
 *  1. TODO campo numérico do catálogo real vem como STRING (`"cd":"21270"`,
 *     `"t":"1"`, `"cdt2":""` quando não há 2º turno) — o parser anterior exigia
 *     `number` e lançava `Ea11ParseError` em cima de dados reais. Corrigido:
 *     coage string→number nos campos que este código usa para comparação/URL
 *     (`cd`, `t`, `tp`, `cdt2`, `idg`, `sqele`, `cdpr`), tratando `""` como
 *     ausente.
 *  2. `abr[]` NÃO lista UFs — tem um único item `{"cd":"br","cp":[...]}`.
 *     Quem diz quais CARGOS pertencem a cada eleição é `cp[].cd` (código de
 *     cargo, o mesmo de `TSE_CONFIG.officeCargoCode`), não uma lista de UFs.
 *     Ex.: eleição "Ordinária Estadual" tem `cp` com `cd` 3,5,6,7,8
 *     (Governador, Senador, Dep. Federal, Dep. Estadual, Dep. Distrital) — a
 *     mesma eleição vale para as 27 UFs, o catálogo não segmenta por estado.
 *     `resolveElection` antes tentava casar `uf` contra `abr[].cd`, o que
 *     nunca encontrava nada (`abr.cd` é sempre `"br"`) — todo cargo estadual
 *     retornava `null`. Corrigido: casa por `cp[].cd`, com `tp` como conferência
 *     cruzada (as duas condições precisam bater; se não bater, prefere não
 *     resolver a arriscar).
 */

export interface Ea11Cargo {
  cd: number;
  ds: string;
  tp: number;
}

export interface Ea11Abrangencia {
  cd: string;
  cp: Ea11Cargo[];
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
  /**
   * Template de diretório publicado pelo próprio catálogo, com placeholders
   * literais (`<base>`, `<ambiente>`, `<ciclo>`, `<cd_eleicao>`, `<uf>`,
   * `<cd_pleito>`, `<municipio>`, `<zona>`, `<secao>`) — ver `tseConfig.ts`
   * (`fillDirTemplate`), que resolve esses placeholders em vez de embutir o
   * formato do caminho fixo no código.
   */
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

/** Converte um campo que pode vir como string ou number para number; "" ou ausente -> undefined. */
function coerceOptionalNumber(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

/** Como `coerceOptionalNumber`, mas exige um valor válido (lança se ausente/inválido). */
function coerceRequiredNumber(v: unknown, fieldName: string): number {
  const n = coerceOptionalNumber(v);
  if (n === undefined) {
    throw new Ea11ParseError(`EA11: campo "${fieldName}" ausente ou não numérico`);
  }
  return n;
}

/**
 * Valida e converte o JSON bruto do EA11 (já decodificado do JWS — ver
 * jws.ts) para `Ea11Catalog`. Lança `Ea11ParseError` para qualquer formato
 * inesperado — nunca aceita um payload parcialmente reconhecido como se fosse
 * um catálogo válido.
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
      if (!isRecord(eleicao) || !Array.isArray(eleicao['abr'])) {
        throw new Ea11ParseError('EA11: eleição com formato inesperado');
      }
      return {
        cd: coerceRequiredNumber(eleicao['cd'], 'e[].cd'),
        cdt2: coerceOptionalNumber(eleicao['cdt2']),
        sqele: coerceOptionalNumber(eleicao['sqele']),
        nm: typeof eleicao['nm'] === 'string' ? eleicao['nm'] : '',
        t: coerceRequiredNumber(eleicao['t'], 'e[].t') as Turn,
        tp: coerceRequiredNumber(eleicao['tp'], 'e[].tp'),
        abr: eleicao['abr'].map((a): Ea11Abrangencia => {
          if (!isRecord(a) || typeof a['cd'] !== 'string') {
            throw new Ea11ParseError('EA11: abrangência com formato inesperado');
          }
          const cp = Array.isArray(a['cp'])
            ? a['cp'].map((c): Ea11Cargo => {
                if (!isRecord(c)) throw new Ea11ParseError('EA11: cargo (cp[]) com formato inesperado');
                return {
                  cd: coerceRequiredNumber(c['cd'], 'cp[].cd'),
                  ds: typeof c['ds'] === 'string' ? c['ds'] : '',
                  tp: coerceRequiredNumber(c['tp'], 'cp[].tp'),
                };
              })
            : [];
          return { cd: a['cd'], cp };
        }),
      };
    });
    return {
      cd: coerceOptionalNumber(pleito['cd']) ?? 0,
      cdpr: coerceOptionalNumber(pleito['cdpr']),
      c: pleito['c'],
      dt: typeof pleito['dt'] === 'string' ? pleito['dt'] : '',
      dtlim: typeof pleito['dtlim'] === 'string' ? pleito['dtlim'] : undefined,
      e,
    };
  });
  return {
    dg: typeof raw['dg'] === 'string' ? raw['dg'] : '',
    hg: typeof raw['hg'] === 'string' ? raw['hg'] : '',
    idg: coerceOptionalNumber(raw['idg']),
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
 * Tipos de eleição (`tp`) confirmados via catálogo real do EA11.
 *
 * Só Presidente é "federal ordinária" (`tp=8`); Governador, Senador, Deputado
 * Federal e Deputado Estadual são todos "estadual ordinária" (`tp=1`) — mesmo
 * Senador e Deputado Federal sendo cargos federais, a totalização deles é de
 * âmbito estadual, igual a Governador/Deputado Estadual.
 */
export const TIPO_ELEICAO_ESTADUAL_ORDINARIA = 1;
export const TIPO_ELEICAO_FEDERAL_ORDINARIA = 8;

/** A que `tp` de eleição pertence cada cargo — ver nota de confirmação acima. */
export function tipoEleicaoForOffice(office: OfficeKey): number {
  if (office === 'presidente') return TIPO_ELEICAO_FEDERAL_ORDINARIA;
  return TIPO_ELEICAO_ESTADUAL_ORDINARIA;
}

export interface ResolvedElection {
  ciclo: string;
  cdEleicao: number;
  /** Código de eleição do 2º turno, se este pleito tiver segundo turno. */
  cdEleicaoTurno2: number | null;
}

/**
 * Localiza, no catálogo já carregado, a eleição correspondente a um cargo e
 * turno. UF NÃO entra aqui — o catálogo real não segmenta eleições por UF
 * (a mesma eleição "estadual" vale para as 27 UFs); UF só importa depois, na
 * hora de montar a URL do arquivo de resultado (`TSE_CONFIG.buildResultPath`).
 *
 * O casamento é por `cp[].cd` (código de cargo dentro da abrangência), com
 * `tp` da eleição como conferência cruzada: as duas condições precisam bater
 * — se não baterem, prefere devolver `null` (o app mostra "indisponível") a
 * arriscar um resultado errado.
 */
export function resolveElection(catalog: Ea11Catalog, office: OfficeKey, turn: Turn): ResolvedElection | null {
  const tipo = tipoEleicaoForOffice(office);
  const cargoCode = TSE_CONFIG.officeCargoCode[office];
  for (const pleito of catalog.pl) {
    for (const eleicao of pleito.e) {
      if (eleicao.tp !== tipo) continue;
      if (turn === 1 && eleicao.t !== 1) continue;
      if (turn === 2 && eleicao.t !== 1 && eleicao.t !== 2) continue;
      const hasCargo = eleicao.abr.some((a) => a.cp.some((c) => c.cd === cargoCode));
      if (!hasCargo) continue;
      return {
        ciclo: pleito.c,
        cdEleicao: eleicao.cd,
        cdEleicaoTurno2: eleicao.cdt2 ?? null,
      };
    }
  }
  return null;
}
