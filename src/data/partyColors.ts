import { hashString } from '../util';

/**
 * Matiz (hue, 0–360) aproximado da identidade visual de cada partido
 * registrado no TSE. O TSE não publica cor nenhuma nos arquivos de resultado
 * (EA20 só traz a sigla, `par.sg` — ver `tseDataProvider.ts`); não existe um
 * "registro oficial de cores" de partido. Os valores abaixo são uma
 * aproximação de bom senso da cor mais associada a cada partido (material de
 * campanha, logotipo), não uma fonte oficial — só para diferenciar partidos
 * visualmente no mapa, nunca usados como dado eleitoral.
 */
const PARTY_HUES: Record<string, number> = {
  PT: 0,
  PL: 215,
  PP: 210,
  PSD: 190,
  UNIAO: 220,
  MDB: 95,
  PSDB: 25,
  PDT: 350,
  PCDOB: 5,
  PSOL: 45,
  REDE: 150,
  PV: 110,
  NOVO: 30,
  PODEMOS: 200,
  REPUBLICANOS: 230,
  SOLIDARIEDADE: 20,
  AVANTE: 40,
  CIDADANIA: 15,
  PATRIOTA: 60,
  PRTB: 235,
  PMB: 170,
  DC: 240,
  AGIR: 50,
  MOBILIZA: 300,
  UP: 0,
  PSTU: 10,
  PCB: 355,
  PCO: 345,
  PRD: 205,
};

/**
 * Matiz determinístico (mesma sigla sempre dá a mesma cor) para qualquer
 * partido fora da tabela acima — nunca falha, nunca inventa um dado
 * eleitoral, só garante uma cor visual estável.
 */
function fallbackHue(party: string): number {
  return hashString(party) % 360;
}

function partyHue(party: string): number {
  const key = party.trim().toUpperCase();
  return PARTY_HUES[key] ?? fallbackHue(key);
}

/**
 * Cor de preenchimento de uma célula do mapa para o partido do candidato
 * líder naquela UF. `decided` vem do mesmo critério rigoroso (nunca
 * estatístico) de "eleito matematicamente" (ver `electionMath.ts`) — células
 * "decididas" ficam bem mais escuras/saturadas que células onde o candidato
 * só está na frente, mas o resultado ainda pode mudar.
 */
export function partyFillColor(party: string, decided: boolean): string {
  const hue = partyHue(party);
  return decided ? `hsl(${hue}, 55%, 40%)` : `hsl(${hue}, 60%, 84%)`;
}
