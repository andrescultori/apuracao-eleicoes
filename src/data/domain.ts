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

export const TURNOUT = 0.8;

export const VALID_RATIO: Record<OfficeKey, number> = {
  presidente: 0.91,
  governador: 0.91,
  senador: 0.91,
  deputadoFederal: 0.83,
  deputadoEstadual: 0.83,
};
