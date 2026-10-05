import type { OfficeConfig, OfficeKey, Uf } from './types';

export const UFS: Uf[] = [
  { sigla: 'AC', nome: 'Acre', peso: 0.6 },
  { sigla: 'AL', nome: 'Alagoas', peso: 2.4 },
  { sigla: 'AP', nome: 'Amapá', peso: 0.6 },
  { sigla: 'AM', nome: 'Amazonas', peso: 2.6 },
  { sigla: 'BA', nome: 'Bahia', peso: 11.0 },
  { sigla: 'CE', nome: 'Ceará', peso: 7.0 },
  { sigla: 'DF', nome: 'Distrito Federal', peso: 2.2 },
  { sigla: 'ES', nome: 'Espírito Santo', peso: 2.9 },
  { sigla: 'GO', nome: 'Goiás', peso: 4.8 },
  { sigla: 'MA', nome: 'Maranhão', peso: 4.9 },
  { sigla: 'MT', nome: 'Mato Grosso', peso: 2.5 },
  { sigla: 'MS', nome: 'Mato Grosso do Sul', peso: 1.9 },
  { sigla: 'MG', nome: 'Minas Gerais', peso: 16.0 },
  { sigla: 'PA', nome: 'Pará', peso: 5.9 },
  { sigla: 'PB', nome: 'Paraíba', peso: 3.0 },
  { sigla: 'PR', nome: 'Paraná', peso: 8.3 },
  { sigla: 'PE', nome: 'Pernambuco', peso: 7.1 },
  { sigla: 'PI', nome: 'Piauí', peso: 2.5 },
  { sigla: 'RJ', nome: 'Rio de Janeiro', peso: 12.9 },
  { sigla: 'RN', nome: 'Rio Grande do Norte', peso: 2.6 },
  { sigla: 'RS', nome: 'Rio Grande do Sul', peso: 8.7 },
  { sigla: 'RO', nome: 'Rondônia', peso: 1.2 },
  { sigla: 'RR', nome: 'Roraima', peso: 0.4 },
  { sigla: 'SC', nome: 'Santa Catarina', peso: 5.9 },
  { sigla: 'SP', nome: 'São Paulo', peso: 34.6 },
  { sigla: 'SE', nome: 'Sergipe', peso: 1.7 },
  { sigla: 'TO', nome: 'Tocantins', peso: 1.1 },
];

export const UF_MAP: Record<string, Uf> = Object.fromEntries(UFS.map((u) => [u.sigla, u]));

/**
 * Posição (coluna, linha) de cada UF num cartograma de grade — um mapa do
 * Brasil estilizado (como os "mapas de grade" usados por veículos de
 * imprensa para eleições americanas), não uma silhueta geográfica real. Não
 * há arquivo de fronteiras reais do Brasil disponível neste projeto (nenhuma
 * fonte de dado geográfico foi usada); as posições abaixo são só uma
 * aproximação de bom senso da posição relativa de cada UF (norte no topo,
 * oeste à esquerda), ajustada à mão para não haver duas UFs na mesma célula.
 */
export const UF_GRID: Record<string, { col: number; row: number }> = {
  AC: { col: 0, row: 3 },
  AM: { col: 1, row: 2 },
  RR: { col: 2, row: 0 },
  AP: { col: 3, row: 1 },
  PA: { col: 3, row: 2 },
  RO: { col: 1, row: 3 },
  TO: { col: 3, row: 3 },
  MA: { col: 4, row: 2 },
  MT: { col: 2, row: 4 },
  PI: { col: 5, row: 3 },
  CE: { col: 6, row: 2 },
  RN: { col: 7, row: 2 },
  PB: { col: 7, row: 3 },
  PE: { col: 6, row: 3 },
  AL: { col: 7, row: 4 },
  SE: { col: 6, row: 4 },
  BA: { col: 5, row: 4 },
  GO: { col: 3, row: 5 },
  DF: { col: 4, row: 4 },
  MS: { col: 2, row: 6 },
  MG: { col: 4, row: 5 },
  ES: { col: 5, row: 5 },
  RJ: { col: 5, row: 6 },
  SP: { col: 4, row: 6 },
  PR: { col: 3, row: 7 },
  SC: { col: 4, row: 7 },
  RS: { col: 3, row: 8 },
};

export const PARTIES = ['ABC', 'XYZ', 'DEF', 'GHI', 'JKL', 'MNO', 'PQR', 'STU', 'VWX', 'LMN'];

export const PARTY_BASE: Record<string, number> = Object.fromEntries(PARTIES.map((p, i) => [p, (i + 1) * 10]));

export const OFFICES: Record<OfficeKey, OfficeConfig> = {
  presidente: {
    label: 'Presidente',
    short: 'Presidente',
    scope: 'national',
    hasRunoff: true,
    digits: 2,
    countRange: [5, 5],
  },
  governador: {
    label: 'Governador',
    short: 'Governador',
    scope: 'uf',
    hasRunoff: true,
    digits: 2,
    countRange: [4, 6],
  },
  senador: {
    label: 'Senador',
    short: 'Senador',
    scope: 'uf',
    hasRunoff: false,
    digits: 3,
    countRange: [4, 7],
  },
  deputadoFederal: {
    label: 'Deputado Federal',
    short: 'Dep. Federal',
    scope: 'uf',
    hasRunoff: false,
    digits: 4,
    countRange: [14, 22],
  },
  deputadoEstadual: {
    label: 'Deputado Estadual',
    short: 'Dep. Estadual',
    scope: 'uf',
    hasRunoff: false,
    digits: 5,
    countRange: [18, 28],
  },
};

export const OFFICE_ORDER: OfficeKey[] = ['presidente', 'governador', 'senador', 'deputadoFederal', 'deputadoEstadual'];

/**
 * Vagas de Senador em disputa neste ciclo — 2 por UF, uniforme no Brasil
 * inteiro. [DOC — regra constitucional, não vem de nenhum arquivo do TSE
 * confirmado ao vivo: o catálogo EA11 não lista número de vagas por cargo
 * (ver `Ea11Cargo` em ea11.ts)]: mandatos de Senador são de 8 anos, com
 * renovação alternada de 1/3 e 2/3 das cadeiras a cada eleição (a cada 4
 * anos) — 1994, 2002, 2010, 2018 e 2026 são todos anos de renovação de 2/3
 * (2 cadeiras por estado); os anos intermediários (1998, 2006, 2014, 2022)
 * renovam 1/3 (1 cadeira). Essa regra não muda de uma eleição pra outra
 * (diferente do número de vagas de Deputado Federal/Estadual, que depende
 * de população/censo e varia por UF — por isso só Senador tem esse número
 * fixo o bastante pra declarar eleitos com segurança; ver nota em
 * `applyElectionCertainty` em appContext.ts sobre por que Deputados ficam
 * de fora).
 */
export const SENADO_SEATS_2026 = 2;

export const TURNOUT = 0.8;

export const VALID_RATIO: Record<OfficeKey, number> = {
  presidente: 0.91,
  governador: 0.91,
  senador: 0.91,
  deputadoFederal: 0.83,
  deputadoEstadual: 0.83,
};
